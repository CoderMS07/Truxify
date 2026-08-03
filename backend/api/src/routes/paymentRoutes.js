/**
 * Payment Routes — UPI → Escrow → Release
 *
 * POST /api/payments/lock
 *   Customer calls this after submitting the on-chain createBooking() tx
 *   via their wallet. The backend verifies the tx on Polygon, then marks
 *   the order escrow_status as 'funded'.
 *
 * GET /api/payments/:orderId/status
 *   Lightweight polling endpoint for the Flutter app to check escrow state.
 *
 * POST /api/payments/upi-intent
 *   Returns the UPI payment intent details (amount, UPI ID, order reference)
 *   needed to construct the UPI deep-link in the Flutter app.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireIdempotency } from '../middleware/idempotency.js';
import { acquireLock, releaseLock } from '../lib/redisLock.js';
import { auditLog } from '../middleware/auditLog.js';
import logger from '../middleware/logger.js';
import { orderRepository } from '../core/container.js';
import { supabase } from '../config/db.js';
import {
  recordDepositTx,
  getEscrowBookingId,
  paisaToMaticWei,
  isEscrowEnabled,
  escrowLockPayment,
} from '../services/escrow.js';
import { sendPushNotification } from '../services/notificationService.js';
import upiPaymentService from '../services/payment/UpiPaymentService.js';

const router = express.Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const lockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many payment requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Validation Schemas ───────────────────────────────────────────────────────

const lockPaymentSchema = z.object({
  order_id: z.string().min(1, 'order_id is required'),
  tx_hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'tx_hash must be a valid 0x-prefixed 32-byte hex transaction hash'),
  wallet_address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'wallet_address must be a valid Ethereum address')
    .optional(),
}).strict();

const upiIntentSchema = z.object({
  order_id: z.string().min(1, 'order_id is required'),
}).strict();

const orderIdParamSchema = z.object({
  orderId: z.string().min(1),
});

// ─── POST /api/payments/upi-intent ───────────────────────────────────────────
/**
 * Returns UPI deep-link parameters for the Flutter app.
 * The Flutter app uses these to open the user's UPI app via url_launcher.
 *
 * Response: { upi_id, amount_inr, amount_paisa, order_ref, deep_link }
 */
router.post(
  '/upi-intent',
  authenticate,
  lockLimiter,
  validateBody(upiIntentSchema),
  async (req, res) => {
    try {
      const { order_id } = req.body;

      const { data: order, error } = await orderRepository.findOrderByIdOrDisplayId(
        order_id,
        'id, order_display_id, customer_id, total_amount, escrow_status, status'
      );

      if (error || !order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      if (order.customer_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Only allow intent if the escrow hasn't been funded yet
      const blockingStatuses = ['funded', 'released', 'refunded'];
      if (blockingStatuses.includes(order.escrow_status)) {
        return res.status(409).json({
          error: `Payment already in status: ${order.escrow_status}`,
          escrow_status: order.escrow_status,
        });
      }

      // Total amount is stored in paisa; convert to INR for display
      const amountPaisa = order.total_amount || 0;
      const amountInr = (amountPaisa / 100).toFixed(2);

      // Platform UPI ID from env (falls back to demo value for dev)
      const platformUpiId = process.env.PLATFORM_UPI_ID || 'truxify@upi';
      const orderRef = order.order_display_id;

      // Standard UPI deep-link format (works with GPay, PhonePe, Paytm, BHIM)
      const deepLink =
        `upi://pay?pa=${encodeURIComponent(platformUpiId)}` +
        `&pn=Truxify` +
        `&am=${amountInr}` +
        `&cu=INR` +
        `&tn=${encodeURIComponent(`Freight payment for ${orderRef}`)}` +
        `&tr=${encodeURIComponent(orderRef)}`;

      logger.info(`[payments] UPI intent generated for order ${orderRef}`);

      return res.json({
        upi_id: platformUpiId,
        amount_inr: amountInr,
        amount_paisa: amountPaisa,
        order_ref: orderRef,
        deep_link: deepLink,
        escrow_enabled: isEscrowEnabled(),
      });
    } catch (err) {
      logger.error('[payments] upi-intent error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ─── POST /api/payments/lock ──────────────────────────────────────────────────
/**
 * Called by the customer Flutter app AFTER the customer's wallet has submitted
 * the createBooking() transaction on-chain. The backend:
 *   1. Finds the order and verifies ownership
 *   2. Acquires a Redis lock (idempotency)
 *   3. Calls recordDepositTx() to verify tx on Polygon
 *   4. Updates escrow_status → 'funded'
 *   5. Sends FCM push to the assigned driver (if any)
 */
router.post(
  '/lock',
  authenticate,
  lockLimiter,
  requireIdempotency(3600),
  validateBody(lockPaymentSchema),
  auditLog({ action: 'payment:lock', resourceType: 'escrow' }),
  async (req, res) => {
    const { order_id, tx_hash, wallet_address } = req.body;
    const lockKey = `payment_lock:${order_id}`;
    let lockAcquired = false;

    try {
      lockAcquired = await acquireLock(lockKey, 30);
      if (!lockAcquired) {
        return res.status(409).json({ error: 'Payment is already being processed for this order. Please wait.' });
      }

      // 1. Fetch order
      const { data: order, error: orderErr } = await orderRepository.findOrderByIdOrDisplayId(
        order_id,
        'id, order_display_id, customer_id, driver_id, total_amount, escrow_status, escrow_booking_id, wallet_address'
      );

      if (orderErr || !order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      if (order.customer_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // 2. Idempotency — already funded
      if (order.escrow_status === 'funded') {
        logger.info(`[payments] Order ${order.order_display_id} already funded — idempotent response`);
        return res.json({
          message: 'Payment already locked in escrow.',
          escrow_status: 'funded',
          order_display_id: order.order_display_id,
        });
      }

      const blockingStatuses = ['released', 'refunded'];
      if (blockingStatuses.includes(order.escrow_status)) {
        return res.status(409).json({
          error: `Cannot lock payment — escrow is already in status: ${order.escrow_status}`,
        });
      }

      // 3. Derive the on-chain booking ID
      const bookingId = order.escrow_booking_id || getEscrowBookingId(order.order_display_id);

      // 4. Verify the deposit transaction on-chain (or skip if escrow not enabled)
      if (isEscrowEnabled()) {
        const senderAddress = wallet_address || order.wallet_address;
        const result = await recordDepositTx(bookingId, tx_hash, senderAddress);

        if (result.error) {
          logger.warn(`[payments] recordDepositTx failed for ${order.order_display_id}: ${result.error}`);
          return res.status(422).json({
            error: `Transaction verification failed: ${result.error}`,
            hint: 'Ensure the transaction is confirmed on Polygon and the wallet address matches your profile.',
          });
        }

        logger.info(`[payments] Deposit verified on-chain for ${order.order_display_id}`);
      } else {
        // Dev/staging mode — skip on-chain verification, trust the client tx_hash
        logger.warn(`[payments] Escrow not configured — accepting tx_hash ${tx_hash} on trust (dev mode)`);
      }

      // 5. Update escrow_status → funded
      const { error: updateErr } = await orderRepository.updateOrder(
        order.id,
        {
          escrow_status: 'funded',
          escrow_booking_id: bookingId,
          escrow_tx_hash: tx_hash,
          escrow_deposited_at: new Date().toISOString(),
          wallet_address: wallet_address || order.wallet_address,
          updated_at: new Date().toISOString(),
        },
        [{ op: 'neq', column: 'escrow_status', value: 'funded' }]
      );

      if (updateErr) {
        logger.error('[payments] Failed to update escrow_status:', updateErr.message);
        return res.status(500).json({ error: 'Payment verified but database update failed. Please contact support.' });
      }

      // 6. Notify assigned driver that payment is now locked
      if (order.driver_id) {
        sendPushNotification(
          order.driver_id,
          '💰 Payment Locked',
          `Customer payment for order ${order.order_display_id} is now locked in escrow. Proceed with delivery.`,
          'payment_locked',
          { order_display_id: order.order_display_id, tx_hash }
        ).catch(err => logger.warn('[payments] Driver FCM push failed:', err.message));
      }

      logger.info(`[payments] Payment locked for order ${order.order_display_id}`);

      return res.status(201).json({
        message: 'Payment successfully locked in escrow. It will be released to the driver upon delivery confirmation.',
        escrow_status: 'funded',
        order_display_id: order.order_display_id,
        booking_id: bookingId,
        tx_hash,
      });
    } catch (err) {
      logger.error('[payments] lock error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      if (lockAcquired) {
        await releaseLock(lockKey).catch(() => {});
      }
    }
  }
);

// ─── GET /api/payments/:orderId/status ───────────────────────────────────────
/**
 * Returns current escrow status for an order.
 * Used by Flutter to poll after submitting the UPI payment.
 */
router.get(
  '/:orderId/status',
  authenticate,
  statusLimiter,
  validateParams(orderIdParamSchema),
  async (req, res) => {
    try {
      const { data: order, error } = await orderRepository.findOrderByIdOrDisplayId(
        req.params.orderId,
        'id, order_display_id, customer_id, driver_id, escrow_status, escrow_booking_id, escrow_deposited_at, escrow_released_at, total_amount, status'
      );

      if (error || !order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      // Both the customer and assigned driver may poll this
      const isParticipant =
        order.customer_id === req.user.id || order.driver_id === req.user.id;

      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      return res.json({
        order_display_id: order.order_display_id,
        escrow_status: order.escrow_status,
        escrow_booking_id: order.escrow_booking_id,
        escrow_deposited_at: order.escrow_deposited_at,
        escrow_released_at: order.escrow_released_at,
        total_amount_paisa: order.total_amount,
        total_amount_inr: order.total_amount ? (order.total_amount / 100).toFixed(2) : null,
        order_status: order.status,
        escrow_enabled: isEscrowEnabled(),
      });
    } catch (err) {
      logger.error('[payments] status error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

const chargeAndLockSchema = z.object({
  order_id: z.string().min(1, 'order_id is required'),
  customer_upi_id: z.string().min(1, 'customer_upi_id is required'),
}).strict();

router.post(
  '/charge-and-lock',
  authenticate,
  lockLimiter,
  validateBody(chargeAndLockSchema),
  async (req, res) => {
    try {
      const { order_id, customer_upi_id } = req.body;

      const { data: order, error: orderErr } = await orderRepository.findOrderByIdOrDisplayId(
        order_id,
        'id, order_display_id, customer_id, driver_id, total_amount, escrow_status, wallet_address'
      );

      if (orderErr || !order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      if (order.customer_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      if (order.escrow_status === 'funded') {
        return res.status(409).json({ error: 'Escrow payment already locked.' });
      }

      if (!order.driver_id) {
        return res.status(400).json({ error: 'No driver is assigned to this order yet.' });
      }

      const { data: driverProfile, error: driverErr } = await supabase
        .from('profiles')
        .select('polygon_wallet_address')
        .eq('id', order.driver_id)
        .maybeSingle();

      const driverWallet = driverProfile?.polygon_wallet_address;
      if (!driverWallet) {
        return res.status(400).json({ error: 'Assigned driver has no registered Polygon wallet on file.' });
      }

      const upiOrder = await upiPaymentService.createPaymentOrder(order.id, order.total_amount);

      let txHash = `mock_tx_${Math.random().toString(36).substring(2, 15)}`;
      const bookingId = getEscrowBookingId(order.order_display_id);
      
      if (isEscrowEnabled()) {
        try {
          const amountWei = paisaToMaticWei(order.total_amount);
          const lockResult = await escrowLockPayment(
            order.order_display_id,
            order.wallet_address || req.user.wallet_address || '0x0000000000000000000000000000000000000000',
            driverWallet,
            amountWei
          );

          if (lockResult.error) {
            logger.error(`[payments] lockPayment failed: ${lockResult.error}`);
            return res.status(500).json({ error: `On-chain lockPayment failed: ${lockResult.error}` });
          }
          txHash = lockResult.txHash;
        } catch (chainErr) {
          logger.error(`[payments] lockPayment chain error: ${chainErr.message}`);
          return res.status(500).json({ error: `On-chain lockPayment call failed: ${chainErr.message}` });
        }
      } else {
        logger.warn('[payments] Escrow disabled. Simulating lockPayment call.');
      }

      const { error: dbErr } = await orderRepository.updateOrder(order.id, {
        escrow_status: 'funded',
        escrow_booking_id: bookingId,
        escrow_tx_hash: txHash,
        escrow_deposited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (dbErr) {
        logger.error('[payments] DB update failed:', dbErr.message);
        return res.status(500).json({ error: 'Payment locked on-chain but database update failed.' });
      }

      if (order.driver_id) {
        sendPushNotification(
          order.driver_id,
          '💰 Payment Locked',
          `Escrow payment for order ${order.order_display_id} is locked. Please deliver.`,
          'payment_locked',
          { order_display_id: order.order_display_id }
        ).catch(err => logger.warn('[payments] Push failed:', err.message));
      }

      return res.status(201).json({
        success: true,
        message: 'UPI payment received and locked in escrow.',
        escrow_status: 'funded',
        tx_hash: txHash,
        gateway_order_id: upiOrder.gateway_order_id,
      });

    } catch (err) {
      logger.error('[payments] charge-and-lock error:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
