import express from 'express';
import crypto from 'crypto';
import logger from '../middleware/logger.js';
import { dlqService } from '../services/webhook/dlqService.js';
import { processEscrowWebhookEvent } from '../services/webhook/escrowWebhookProcessor.js';

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * Verify HMAC-SHA256 signature on incoming webhook requests.
 * Reads the raw body and compares against the X-Webhook-Signature header.
 */
function verifyWebhookSignature(req, res, next) {
  if (!WEBHOOK_SECRET) {
    // Fail closed: never accept unsigned webhook traffic when the shared
    // secret is missing from the environment.
    logger.error('[Webhook] WEBHOOK_SECRET not set — rejecting webhook request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Webhook-Signature header' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('[Webhook] rawBody missing — cannot verify signature, rejecting request');
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length) {
    logger.warn('[Webhook] Invalid webhook signature length — rejecting request');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    logger.warn('[Webhook] Invalid webhook signature — rejecting request');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

/**
 * Build a caller-safe error description for webhook clients.
 *
 * Internal failure details (raw provider/RPC errors, database errors, stack
 * traces, contract internals, secrets) are NEVER echoed back to the webhook
 * provider. Permanent failures carry a stable error code so operators can
 * correlate; transient failures are described generically since they are
 * retried by the DLQ.
 */
function safeWebhookError(orderId, error) {
  const prefix = `Webhook processing failed for order ${orderId}`;
  const code = error && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : null;
  return code ? `${prefix} (${code})` : prefix;
}

/**
 * @route POST /api/webhooks/escrow
 * @desc Receive webhook events from Escrow smart contracts
 * @access Webhook Provider (HMAC signature required)
 */
router.post('/escrow', verifyWebhookSignature, async (req, res) => {
  const { eventType, orderId, txHash } = req.body;

  try {
    logger.info(`[Webhook] Received Escrow event: ${eventType} for order ${orderId}`);
    await processEscrowWebhookEvent(eventType, req.body);
    return res.status(200).json({ received: true });
  } catch (error) {
    // Full detail goes to server logs / DLQ for operator triage only.
    logger.error(
      { webhookEventType: eventType, orderId, errorCode: error?.code || null },
      `[Webhook] Failed to process escrow webhook for order ${orderId}: ${error.message}`,
    );

    // Enqueue to Dead Letter Queue for background retries
    const enqueued = await dlqService.enqueueFailure('escrow', eventType, req.body, error);

    // Fail closed: if the event cannot be persisted to the DLQ, return 500 so
    // the provider retries. Returning 202 would silently drop the event forever.
    if (!enqueued) {
      return res.status(500).json({
        error: 'Webhook processing failed and the event could not be queued for retry',
      });
    }

    // Return 202 Accepted so the provider stops retrying - we now own the retry logic via our DLQ.
    // Non-retryable failures are dead-lettered immediately (failed_permanently).
    const permanent = error && typeof error === 'object' && error.retryable === false;
    return res.status(202).json({
      received: true,
      status: permanent ? 'dead_lettered' : 'queued_for_retry',
      error: safeWebhookError(orderId, error),
    });
  }
});

export default router;
