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
  sendPushNotification,
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
import upiPaymentService from '../payment/UpiPaymentService.js';

/** Haversine great-circle distance in metres between two lat/lng points. */
function _haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Haversine great-circle distance in metres between two lat/lng points. */
function _haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const orderTimelineService = new OrderTimelineService({ supabase, logger });

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
    this.trackingTokenService = deps.trackingTokenService || null;
  }

  async validateDeliveryOtp({ orderId, driverId, otp }) {
    return measureExecution('DeliveryVerificationService.validateDeliveryOtp', async () => {
    if (await checkOtpLockout(orderId)) {
      throw new DomainError(429, {
        error: `Too many failed OTP attempts. Verification is locked for ${OTP_LOCKOUT_MINUTES} minutes.`,
      });
    }

    const { data: order, error: orderErr } = await this.orderRepository.findOrderById(orderId, 'id, order_display_id, driver_id, customer_id, escrow_status, escrow_release_attempts, status, release_tx_hash, drop_lat, drop_lng, toll_estimate, base_freight, platform_fee, total_amount');

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

  /**
   * GPS Geofence Auto-Confirm
   *
   * If the driver is within geofenceRadiusM (default 500 m) of the drop
   * location, this method auto-confirms delivery without requiring the
   * customer to share their OTP. A synthetic bypass OTP is generated
   * internally, stored, and immediately consumed by verifyDelivery().
   *
   * @param {object} params
   * @param {string} params.orderId    - Order UUID
   * @param {string} params.driverId   - Driver's Supabase user ID
   * @param {number} params.driverLat  - Driver's current latitude
   * @param {number} params.driverLng  - Driver's current longitude
   * @param {number} [params.geofenceRadiusM=500] - Geofence radius in metres
   * @returns {Promise<{autoConfirmed: boolean, distanceM: number, message: string}>}
   */
  async geofenceAutoConfirm({ orderId, driverId, driverLat, driverLng, geofenceRadiusM = 500 }) {
    return measureExecution('DeliveryVerificationService.geofenceAutoConfirm', async () => {

    // Fetch order including drop coords and current status
    const { data: order, error: orderErr } = await this.orderRepository.findOrderById(
      orderId,
      'id, order_display_id, driver_id, customer_id, drop_lat, drop_lng, status, escrow_status, total_amount'
    );

    if (orderErr || !order) {
      throw new DomainError(404, { error: 'Order not found.' });
    }

    if (order.driver_id !== driverId) {
      throw new DomainError(403, { error: 'Access Denied: You are not assigned to this order.' });
    }

    if (!DELIVERY_OTP_READY_STATUSES.has(order.status)) {
      throw new DomainError(409, {
        error: 'Geofence auto-confirm is only available when the order status is "arriving".',
      });
    }

    if (!order.drop_lat || !order.drop_lng) {
      throw new DomainError(422, { error: 'Drop location coordinates are not available for this order.' });
    }

    const distanceM = _haversineM(
      Number(driverLat), Number(driverLng),
      Number(order.drop_lat), Number(order.drop_lng)
    );

    logger.info(
      `[geofence] Order ${orderId}: driver is ${Math.round(distanceM)}m from drop ` +
      `(threshold: ${geofenceRadiusM}m)`
    );

    if (distanceM > geofenceRadiusM) {
      return {
        autoConfirmed: false,
        distanceM: Math.round(distanceM),
        message: `Driver is ${Math.round(distanceM)}m from drop point. Must be within ${geofenceRadiusM}m for auto-confirm.`,
      };
    }

    // --- Driver is within geofence ---

    // Record geofence confirmation in DB
    await this.orderRepository.updateOrder(orderId, {
      geofence_confirmed: true,
      geofence_confirmed_at: new Date().toISOString(),
      geofence_driver_lat: driverLat,
      geofence_driver_lng: driverLng,
      updated_at: new Date().toISOString(),
    }).catch(err => logger.warn('[geofence] Failed to persist geofence flag:', err.message));

    // Generate a one-time bypass OTP and immediately verify delivery
    const bypassOtp = crypto.randomInt(100000, 1000000).toString();
    await this.notificationService.storeDeliveryOtp(orderId, bypassOtp, 5); // 5-minute TTL

    await this.verifyDelivery({ orderId, driverId, otp: bypassOtp });

    return {
      autoConfirmed: true,
      distanceM: Math.round(distanceM),
      message: 'Delivery auto-confirmed via GPS geofence. Payment released to driver.',
    };
    });
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

        // Trigger UPI Payout to the Driver
        try {
          const driverId = order.driver_id;
          const { data: driverProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', driverId)
            .maybeSingle();

          const { data: driverPaymentMethod } = await supabase
            .from('payment_methods')
            .select('display_label')
            .eq('user_id', driverId)
            .eq('method_type', 'upi')
            .maybeSingle();

          const driverUpiId = driverPaymentMethod?.display_label || 
            `${(driverProfile?.full_name || 'driver').toLowerCase().replace(/[^a-z0-9]/g, '')}@okaxis`;

          const payoutResult = await upiPaymentService.processDriverPayout(driverUpiId, order.total_amount);
          logger.info(`[payments] UPI Payout processed successfully for driver: ${driverUpiId}, payoutId: ${payoutResult.payout_id}`);
        } catch (payoutErr) {
          logger.error(`[payments] UPI payout to driver failed: ${payoutErr.message}`);
        }
      } catch (releaseErr) {
        logger.error('[escrow] Blockchain release failed for order', orderId, ':', releaseErr.message);
        throw new DomainError(503, {
          error: 'Blockchain escrow release failed. Payment cannot be processed. Please retry.',
          retryable: true,
        });
      }

      // Persist the confirmed release outcome immediately so a later
      // complete_trip_tx failure is recoverable: escrow_status becomes
      // 'released' before the RPC runs, so the SQL gate no longer blocks
      // retries with a NULL release hash.
      if (releaseTxHash || escrowAlreadyReleased) {
        const { error: persistReleaseErr } = await this.orderRepository.updateOrder(orderId, {
          escrow_status: 'released',
          escrow_release_error: null,
          escrow_released_at: new Date().toISOString(),
          release_tx_hash: releaseTxHash,
        });

        if (persistReleaseErr) {
          logger.error('[escrow] Release confirmed but persistence failed:', persistReleaseErr.message);
        }
      }
    } else if (order.escrow_status === 'released') {
      // Release was confirmed in a previous attempt — reuse the persisted hash.
      releaseTxHash = order.release_tx_hash || null;
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
      }, userClient);
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

    // The trip is complete (payment_released) — kill any active public
    // tracking tokens so a shared link can no longer broadcast the driver's
    // live location. Best-effort: revokeAllForOrder never throws.
    await this.trackingTokenService?.revokeAllForOrder(order.order_display_id);

    // --- Fire FCM push to driver: "Payment Released ✓" ---
    const resolvedDriverIdForPush = tripData?.driver_id || order.driver_id;
    if (resolvedDriverIdForPush) {
      const amountInr = order.total_amount
        ? `₹${(order.total_amount / 100).toFixed(0)}`
        : 'your amount';
      sendPushNotification(
        resolvedDriverIdForPush,
        '✅ Payment Released',
        `Payment Released ✓ ${amountInr} credited for order ${order.order_display_id}`,
        'payment_released',
        {
          order_display_id: order.order_display_id,
          release_tx_hash: releaseTxHash || '',
          amount_paisa: String(order.total_amount || 0),
        }
      ).catch(err => logger.warn('[FCM] Payment release push failed:', err.message));
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