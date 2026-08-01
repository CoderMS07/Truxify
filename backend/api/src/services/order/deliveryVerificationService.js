import crypto from 'crypto';
import { supabase, redisClient, mongoDb } from '../../config/db.js';
import { DomainError } from './domainError.js';
import { measureExecution } from '../../core/performanceMetrics.js';
import { haversineKm } from '../../lib/pricing.js';
import {
  sendDeliveryOtpNotification,
  storeDeliveryOtp,
  getActiveDeliveryOtp,
  verifyDeliveryOtp,
} from '../notificationService.js';
import {
  OTP_TTL_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_LOCKOUT_MINUTES,
  checkOtpLockout,
  recordOtpFailure,
  clearOtpState,
} from './orderNotificationService.js';
import { escrowRelease as defaultEscrowRelease } from '../escrow.js';
import logger from '../../middleware/logger.js';
import { OrderTimelineService } from './orderTimelineService.js';

const DELIVERY_OTP_READY_STATUSES = new Set(['arriving']);

const DELIVERY_GEOFENCE_RADIUS_KM = Number(process.env.DELIVERY_GEOFENCE_RADIUS_KM) || 0.5;
const DELIVERY_GEOFENCE_MAX_AGE_MS = Number(process.env.DELIVERY_GEOFENCE_MAX_AGE_MS) || 5 * 60 * 1000;

function toEpochMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

export class DeliveryVerificationService {
  constructor(orderRepository, deps = {}) {
    this.orderRepository = orderRepository;
    this.orderTimelineService = deps.orderTimelineService || new OrderTimelineService(supabase);
    this.notificationService = deps.notificationService || {
      sendDeliveryOtpNotification,
      storeDeliveryOtp,
      getActiveDeliveryOtp,
      verifyDeliveryOtp,
    };
    this.escrowReleaseFn = deps.escrowReleaseFn || defaultEscrowRelease;
  }

  async validateDeliveryOtp({ orderId, driverId, otp }) {
    return measureExecution('DeliveryVerificationService.validateDeliveryOtp', async () => {
    if (await checkOtpLockout(orderId)) {
      throw new DomainError(429, {
        error: `Too many failed OTP attempts. Verification is locked for ${OTP_LOCKOUT_MINUTES} minutes.`,
      });
    }

    const { data: order, error: orderErr } = await this.orderRepository.findOrderById(orderId, 'id, order_display_id, driver_id, customer_id, escrow_status, escrow_release_attempts, status, drop_lat, drop_lng, toll_estimate, base_freight, platform_fee, total_amount');

    if (orderErr || !order) {
      throw new DomainError(404, { error: 'Order not found.' });
    }

    if (order.driver_id !== driverId) {
      throw new DomainError(403, { error: 'Access Denied: You are not assigned to this order.' });
    }

    const isRetryForStuckEscrow = order.status === 'payment_released' && ['funded', 'release_failed'].includes(order.escrow_status);

    if (!DELIVERY_OTP_READY_STATUSES.has(order.status) && !isRetryForStuckEscrow) {
      throw new DomainError(409, {
        error: 'Delivery OTP can only be verified after the shipment reaches the delivery location.',
      });
    }

    const otpRecord = await this.notificationService.getActiveDeliveryOtp(orderId);
    if (!otpRecord) {
      throw new DomainError(400, {
        error: 'OTP not available or has expired. Please request a new delivery OTP.',
      });
    }

    const submittedHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
    let isMatch = false;
    if (otpRecord.otp_hash && otpRecord.otp_hash.length === submittedHash.length) {
      isMatch = crypto.timingSafeEqual(
        Buffer.from(otpRecord.otp_hash, 'hex'),
        Buffer.from(submittedHash, 'hex')
      );
    }

    if (!isMatch) {
      const count = await recordOtpFailure(orderId);
      const remaining = Math.max(0, OTP_MAX_FAILED_ATTEMPTS - count);
      const message = remaining > 0
        ? `Invalid OTP. ${remaining} attempt(s) remaining before lockout.`
        : `Invalid OTP. Verification is locked for ${OTP_LOCKOUT_MINUTES} minutes due to too many failed attempts.`;
      logger.warn(`[DeliveryVerificationService] Failed verification attempt for order ${orderId} by driver ${driverId}. ${remaining} attempts remaining.`);
      throw new DomainError(400, { error: message });
    }

    return { order, otpRecord };
    });
  }

  async completeDeliveryOtp({ otpRecordId, orderId }) {
    return measureExecution('DeliveryVerificationService.completeDeliveryOtp', async () => {
    const verified = await this.notificationService.verifyDeliveryOtp(otpRecordId);
    if (!verified) {
      logger.warn('[DeliveryVerificationService] Failed to mark OTP as verified for order', orderId);
    }
    await clearOtpState(orderId);
    });
  }

  async ensureDeliveryOtp({ orderId }) {
    return measureExecution('DeliveryVerificationService.ensureDeliveryOtp', async () => {
    if (await checkOtpLockout(orderId)) {
      throw new DomainError(429, {
        error: `Too many failed OTP attempts. Delivery OTP is locked for ${OTP_LOCKOUT_MINUTES} minutes.`,
      });
    }

    const activeOtp = await this.notificationService.getActiveDeliveryOtp(orderId);
    if (activeOtp) {
      logger.warn(`[DeliveryVerificationService] Driver attempted OTP regeneration for order ${orderId}`);
      return { generated: false, otp: null };
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const stored = await this.notificationService.storeDeliveryOtp(orderId, otp, OTP_TTL_MINUTES);
    if (!stored) {
      throw new Error('Failed to generate delivery OTP.');
    }
    await clearOtpState(orderId);
    return { generated: true, otp };
    });
  }

  async resendDeliveryOtp({ orderId, customerId, orderDisplayId, orderStatus }) {
    return measureExecution('DeliveryVerificationService.resendDeliveryOtp', async () => {
    if (await checkOtpLockout(orderId)) {
      throw new DomainError(429, {
        error: `Too many failed OTP attempts. Delivery OTP is locked for ${OTP_LOCKOUT_MINUTES} minutes.`,
      });
    }

    const terminalStatuses = ['delivered', 'cancelled', 'payment_released'];
    if (terminalStatuses.includes(orderStatus)) {
      throw new DomainError(400, { error: 'Cannot resend OTP for a completed or cancelled order.' });
    }
    if (!DELIVERY_OTP_READY_STATUSES.has(orderStatus)) {
      throw new DomainError(409, { error: 'Delivery OTP can only be sent after the shipment reaches the delivery location.' });
    }

    const activeOtp = await this.notificationService.getActiveDeliveryOtp(orderId);
    const otp = crypto.randomInt(100000, 1000000).toString();
    const stored = await this.notificationService.storeDeliveryOtp(orderId, otp, OTP_TTL_MINUTES);
    if (!stored) {
      throw new Error('Failed to generate delivery OTP.');
    }
    // Only a fresh issuance after the previous OTP expired may reset the
    // failure counter; an active-OTP resend keeps it so repeated resends
    // cannot zero out the brute-force budget.
    if (!activeOtp) {
      await clearOtpState(orderId);
    }

    const notifResult = await this.notificationService.sendDeliveryOtpNotification(customerId, orderDisplayId, otp);
    if (!notifResult.success) {
      logger.warn(`[DeliveryVerificationService] Resend OTP notification failed for order ${orderDisplayId} — FCM error: ${notifResult.fcm?.error || 'unknown'}`);
    }

    return { expiresInMinutes: OTP_TTL_MINUTES };
    });
  }

  async sendOtpNotification({ orderId, customerId, orderDisplayId, otp }) {
    return measureExecution('DeliveryVerificationService.sendOtpNotification', async () => {
    const notifResult = await this.notificationService.sendDeliveryOtpNotification(customerId, orderDisplayId, otp);
    if (!notifResult.success) {
      logger.warn(`[DeliveryVerificationService] Delivery OTP notification failed for order ${orderDisplayId} — FCM error: ${notifResult.fcm?.error || 'unknown'}`);
      await this.orderRepository.updateOrder(orderId, {
        notification_failed: true,
        updated_at: new Date().toISOString(),
      });
    }
    });
  }

  async generateDeliveryOtp({ orderId }) {
    return measureExecution('DeliveryVerificationService.generateDeliveryOtp', async () => {
    const result = await this.ensureDeliveryOtp({ orderId });
    return { generated: result.generated, otp: result.otp };
    });
  }

  async assertDriverAtDropoff(order) {
    const rawDropLat = order.drop_lat;
    const rawDropLng = order.drop_lng;
    if (rawDropLat === null || rawDropLat === undefined || rawDropLat === '' ||
        rawDropLng === null || rawDropLng === undefined || rawDropLng === '') {
      throw new DomainError(400, {
        error: 'Order is missing drop-off coordinates. Delivery cannot be confirmed.',
      });
    }
    const dropLat = Number(rawDropLat);
    const dropLng = Number(rawDropLng);
    if (!Number.isFinite(dropLat) || !Number.isFinite(dropLng)) {
      throw new DomainError(400, {
        error: 'Order has invalid drop-off coordinates. Delivery cannot be confirmed.',
      });
    }

    if (!mongoDb) {
      throw new DomainError(503, {
        error: 'Driver location service is unavailable. Please retry shortly.',
        retryable: true,
      });
    }

    const latestTelemetry = await mongoDb
      .collection('telemetry')
      .find({ driver_id: order.driver_id, order_id: order.id })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    const telemetry = latestTelemetry && latestTelemetry[0];
    if (!telemetry) {
      throw new DomainError(409, {
        error: 'Driver location is not available. Delivery can only be confirmed when the driver is at the drop-off location.',
      });
    }

    const lat = Number(telemetry.lat);
    const lng = Number(telemetry.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new DomainError(409, { error: 'Driver location is invalid. Delivery cannot be confirmed.' });
    }

    const telemetryTime = telemetry.server_received_at || telemetry.buffered_at || telemetry.timestamp;
    const timestampMs = toEpochMs(telemetryTime);
    if (timestampMs === null || Date.now() - timestampMs > DELIVERY_GEOFENCE_MAX_AGE_MS) {
      throw new DomainError(409, {
        error: 'Driver location is stale. Delivery can only be confirmed when the driver is at the drop-off location.',
      });
    }

    const distanceKm = haversineKm(lat, lng, dropLat, dropLng);
    if (distanceKm > DELIVERY_GEOFENCE_RADIUS_KM) {
      throw new DomainError(409, {
        error: `Driver is ${distanceKm.toFixed(2)} km from the drop-off location. Delivery can only be confirmed within ${DELIVERY_GEOFENCE_RADIUS_KM} km of the drop-off.`,
      });
    }
  }

  async verifyDelivery({ orderId, driverId, otp }) {
    return measureExecution('DeliveryVerificationService.verifyDelivery', async () => {
    const { order, otpRecord } = await this.validateDeliveryOtp({ orderId, driverId, otp });

    const isRetryForStuckEscrow = order.status === 'payment_released' && ['funded', 'release_failed'].includes(order.escrow_status);

    if (!isRetryForStuckEscrow) {
      await this.assertDriverAtDropoff(order);
    }

    let releaseTxHash = null;
    let escrowAlreadyReleased = false;

    // 1. Execute Blockchain Release FIRST to fail-safe if network errors occur
    if (order.escrow_status === 'funded' || order.escrow_status === 'release_failed') {
      try {
        const releaseResult = await this.escrowReleaseFn(order.order_display_id);
        if (releaseResult.txHash) {
          releaseTxHash = releaseResult.txHash;
        } else if (releaseResult.alreadyReleased) {
          escrowAlreadyReleased = true;
        } else {
          throw new Error('Escrow release returned no transaction hash');
        }
      } catch (releaseErr) {
        logger.error('[escrow] Blockchain release failed for order', orderId, ':', releaseErr.message);
        throw new DomainError(503, {
          error: 'Blockchain escrow release failed. Payment cannot be processed. Please retry.',
          retryable: true,
        });
      }
    } else {
      logger.info(`[escrow] Escrow not funded (status: ${order.escrow_status}) — skipping on-chain release.`);
    }

    // 2. Execute Postgres RPC to complete the trip AFTER blockchain success
    let verifiedOrder;
    let tripData = null;

    if (!isRetryForStuckEscrow) {
      const guardResult = await this.orderRepository.updateOrderGuardStatus(
        orderId,
        { updated_at: new Date().toISOString() },
        ['cancelled', 'payment_released']
      );

      if (guardResult.error) {
        const pgCode = guardResult.error.code;
        if (pgCode === 'PGRST116') {
          throw new DomainError(409, { error: 'Order was already cancelled or payment released.' });
        }
        throw new DomainError(500, { error: 'Failed to verify OTP.', details: guardResult.error.message });
      }

      const rpcResult = await this.orderRepository.executeRpc('complete_trip_tx', {
        p_order_id: orderId,
        p_otp_id: otpRecord.id,
        p_release_tx_hash: releaseTxHash,
      });
      tripData = rpcResult.data;

      if (rpcResult.error) {
        logger.error('complete_trip_tx RPC failed:', rpcResult.error.message);
        throw new DomainError(500, { error: 'Failed to complete trip.', details: rpcResult.error.message });
      }

      const verifyResult = await this.orderRepository.findOrderById(orderId, 'status, escrow_status, escrow_release_attempts');
      verifiedOrder = verifyResult.data;

      if (verifyResult.error || !verifiedOrder) {
        logger.error(`[verify-delivery] Failed to verify order status after RPC for order ${orderId}`);
        throw new DomainError(500, { error: 'Failed to verify order status after payment release.' });
      }

      if (verifiedOrder.status !== 'payment_released') {
        logger.warn(`[verify-delivery] Order ${orderId} status changed to "${verifiedOrder.status}" — payment was not released.`);
        throw new DomainError(409, {
          error: 'Order status changed during processing. Payment was not released.',
        });
      }

      await this.completeDeliveryOtp({ otpRecordId: otpRecord.id, orderId });
    } else {
      logger.info(`[verify-delivery] Retry for stuck escrow for order ${orderId} by driver ${driverId}`);
    }

    let escrowUpdateFailed = false;
    if (releaseTxHash || escrowAlreadyReleased) {
      const { error: releaseUpdateErr } = await this.orderRepository.updateOrder(orderId, {
        escrow_status: 'released',
        escrow_release_error: null,
        escrow_released_at: new Date().toISOString(),
        release_tx_hash: releaseTxHash,
      });

      if (releaseUpdateErr) {
        logger.error('[escrow] Release confirmed but persistence failed:', releaseUpdateErr.message);
        escrowUpdateFailed = true;
      } else {
        const resolvedDriverId = tripData?.driver_id || order.driver_id;
        const resolvedDisplayId = tripData?.order_display_id || order.order_display_id;
        if (resolvedDriverId) {
          const { error: walletErr } = await this.orderRepository.updateWalletTransaction(
            resolvedDriverId,
            resolvedDisplayId,
            { description: `Escrow payout for ${resolvedDisplayId}` }
          );

          if (walletErr) {
            logger.error('[wallet] Failed to persist escrow payout:', walletErr.message);
          }
        }
      }
    }

    return { escrowUpdateFailed };
    });
  }
}