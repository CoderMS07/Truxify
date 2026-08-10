import { supabaseAdmin } from '../../config/db.js';
import logger from '../../middleware/logger.js';
import {
  normalizeTxHash,
  verifyPolygonEscrowTransaction,
  verifyPolygonWithdrawalTransaction,
  EscrowVerificationError,
} from './escrowVerification.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escrow statuses a release/withdrawal webhook may legitimately reconcile.
const RELEASE_RECONCILABLE_STATUSES = ['funded', 'release_failed'];
// Escrow statuses a cancellation/refund webhook may legitimately reconcile.
const REFUND_RECONCILABLE_STATUSES = ['funded', 'refund_pending', 'refund_failed'];
const RELEASE_TARGET_STATUSES = [...RELEASE_RECONCILABLE_STATUSES, 'released'];
const REFUND_TARGET_STATUSES = [...REFUND_RECONCILABLE_STATUSES, 'refunded'];

const ORDER_COLUMNS =
  'id, order_display_id, driver_id, escrow_status, release_tx_hash, refund_tx_hash, escrow_amount_wei, escrow_disabled, status';

function requireDb() {
  if (!supabaseAdmin) {
    throw new Error('Escrow webhook reconciliation requires supabaseAdmin to be configured');
  }
  return supabaseAdmin;
}

async function findOrderByIdOrDisplayId(orderId) {
  const db = requireDb();
  if (!orderId) {
    throw new Error('Missing orderId in escrow webhook payload');
  }
  const columns = 'id, order_display_id, driver_id, escrow_status, release_tx_hash, refund_tx_hash';

  if (UUID_REGEX.test(orderId)) {
    const { data, error } = await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle();
    if (!error && data) {
      return data;
    }
  }

  const { data, error } = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('order_display_id', orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load order for webhook reconciliation: ${error.message}`);
  }
  if (!data) {
    throw new Error(`No order found for escrow webhook event (orderId: ${orderId})`);
  }
  return data;
}

async function reconcileWalletLedger(order, txHash) {
  if (!order.driver_id) {
    return;
  }
  const { data, error } = await requireDb()
    .from('wallet_transactions')
    .update({
      status: 'confirmed',
      description: `Escrow payout for ${order.order_display_id}`,
    })
    .eq('driver_id', order.driver_id)
    .eq('order_display_id', order.order_display_id)
    .eq('txn_type', 'credit')
    .select('id');

  if (error) {
    throw new Error(`Failed to reconcile wallet ledger for ${order.order_display_id}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      `Wallet ledger reconciliation matched no credit transaction for order ${order.order_display_id} ` +
        `(driver ${order.driver_id}) — driver payout may be unconfirmed`
    );
  }
}

// Soft driver-wallet lookup for the on-chain correlation check. Never fatal:
// a failed lookup just skips the soft check (bookingId correlation remains the
// authoritative binding between a transaction and an order).
async function findDriverPolygonWallet(driverId) {
  if (!driverId) return null;
  try {
    const { data, error } = await requireDb()
      .from('driver_details')
      .select('polygon_wallet_address')
      .eq('user_id', driverId)
      .maybeSingle();
    if (error || !data) return null;
    return data.polygon_wallet_address || null;
  } catch (err) {
    logger.warn(`[Webhook] Failed to load driver polygon wallet for ${driverId}: ${err?.message}`);
    return null;
  }
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (String(error.code) === '23505') return true;
  return /duplicate key value violates unique constraint/i.test(error.message || '');
}

function assertEscrowEnabled(order) {
  if (order.escrow_disabled) {
    throw new EscrowVerificationError(
      'ESCROW_DISABLED',
      `Order ${order.order_display_id} is not escrow-backed; refusing to reconcile release webhook`,
      { retryable: false },
    );
  }
  if (order.status === 'cancelled') {
    throw new EscrowVerificationError(
      'ORDER_CANCELLED',
      `Order ${order.order_display_id} is cancelled; refusing to reconcile release webhook`,
      { retryable: false },
    );
  }
}

// Mark an order escrow-released after on-chain verification, protecting against
// the same transaction hash being recorded against a different order (replay).
async function releaseOrder({ order, txHash, now }) {
  const db = requireDb();

  // Pre-emptive replay check. The unique partial index on release_tx_hash is
  // the durable guarantee; this gives a clean permanent error before any write.
  const replayCheck = await db
    .from('orders')
    .select('id, order_display_id')
    .eq('release_tx_hash', txHash)
    .neq('id', order.id)
    .maybeSingle();
  if (replayCheck.error) {
    throw new Error(`Failed to check release_tx_hash replay for ${order.order_display_id}: ${replayCheck.error.message}`);
  }
  if (replayCheck.data) {
    throw new EscrowVerificationError(
      'TX_HASH_REPLAY',
      `Transaction ${txHash} is already recorded against order ${replayCheck.data.order_display_id || replayCheck.data.id}`,
      { retryable: false },
    );
  }

  const { error } = await db
    .from('orders')
    .update({
      escrow_status: 'released',
      release_tx_hash: txHash,
      escrow_released_at: now,
      escrow_release_error: null,
      updated_at: now,
    })
    .eq('id', order.id)
    .in('escrow_status', RELEASE_RECONCILABLE_STATUSES);

  if (error) {
    if (isUniqueViolation(error)) {
      throw new EscrowVerificationError(
        'TX_HASH_REPLAY',
        `Transaction ${txHash} is already recorded against another order`,
        { retryable: false },
      );
    }
    throw new Error(`Failed to mark order ${order.order_display_id} as released: ${error.message}`);
  }

  await reconcileWalletLedger(order, txHash);
  logger.info(`[Webhook] Order ${order.order_display_id} marked escrow released after on-chain verification (tx: ${txHash})`);
}

async function handlePaymentReleased(payload) {
  const order = await findOrderByIdOrDisplayId(payload.orderId);
  const now = new Date().toISOString();

  // Idempotent duplicate delivery: the release was already applied. Re-confirm
  // the (idempotent) wallet ledger so a crash between the order update and the
  // wallet update is healed, then short-circuit without re-applying effects.
  if (order.escrow_status === 'released') {
    const payloadHash = normalizeTxHash(payload.txHash);
    if (order.release_tx_hash) {
      if (payloadHash && payloadHash !== order.release_tx_hash.toLowerCase()) {
        throw new EscrowVerificationError(
          'TX_HASH_CONFLICT',
          `Order ${order.order_display_id} is already released with a different transaction hash`,
          { retryable: false },
        );
      }
      await reconcileWalletLedger(order, order.release_tx_hash);
      logger.info(`[Webhook] Order ${order.order_display_id} already released — duplicate delivery ignored.`);
      return;
    }
    // Released but no hash on file (heal path): verify and persist the evidence.
    if (!payloadHash) {
      throw new EscrowVerificationError(
        'INVALID_TX_HASH',
        'Released order is missing release_tx_hash; a well-formed transaction hash is required to heal it',
        { retryable: false },
      );
    }
    assertEscrowEnabled(order);
    const verification = await verifyPolygonEscrowTransaction({
      txHash: payloadHash,
      orderDisplayId: order.order_display_id,
      driverWalletAddress: await findDriverPolygonWallet(order.driver_id),
      expectedAmountWei: order.escrow_amount_wei,
    });
    const { error } = await requireDb()
      .from('orders')
      .update({ release_tx_hash: verification.txHash, updated_at: now })
      .eq('id', order.id)
      .eq('escrow_status', 'released');
    if (error) {
      if (isUniqueViolation(error)) {
        throw new EscrowVerificationError(
          'TX_HASH_REPLAY',
          `Transaction ${verification.txHash} is already recorded against another order`,
          { retryable: false },
        );
      }
      throw new Error(`Failed to persist release_tx_hash for ${order.order_display_id}: ${error.message}`);
    }
    await reconcileWalletLedger(order, verification.txHash);
    logger.info(`[Webhook] Order ${order.order_display_id} release_tx_hash healed after on-chain verification (tx: ${verification.txHash})`);
    return;
  }

  // Active path: the order is not yet released. Refuse orders that cannot be
  // released and require a well-formed hash BEFORE any on-chain or DB work.
  assertEscrowEnabled(order);
  if (!RELEASE_RECONCILABLE_STATUSES.includes(order.escrow_status)) {
    throw new EscrowVerificationError(
      'UNEXPECTED_ESCROW_STATUS',
      `Order ${order.order_display_id} has escrow_status ${order.escrow_status}; cannot be released by PaymentReleased webhook`,
      { retryable: false },
    );
  }
  const txHash = normalizeTxHash(payload.txHash);
  if (!txHash) {
    throw new EscrowVerificationError(
      'INVALID_TX_HASH',
      'PaymentReleased webhook requires a well-formed 32-byte transaction hash (0x + 64 hex chars)',
      { retryable: false },
    );
  }

  const verification = await verifyPolygonEscrowTransaction({
    txHash,
    orderDisplayId: order.order_display_id,
    driverWalletAddress: await findDriverPolygonWallet(order.driver_id),
    expectedAmountWei: order.escrow_amount_wei,
  });

  await releaseOrder({ order, txHash: verification.txHash, now });
  const { data: updatedOrders, error } = await requireDb()
    .from('orders')
    .update({
      escrow_status: 'released',
      release_tx_hash: payload.txHash || order.release_tx_hash || null,
      escrow_released_at: now,
      escrow_release_error: null,
      updated_at: now,
    })
    .eq('id', order.id)
    .in('escrow_status', RELEASE_RECONCILABLE_STATUSES)
    .select('id');

  if (error) {
    throw new Error(`Failed to mark order ${order.order_display_id} as released: ${error.message}`);
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    throw new Error(
      `Order ${order.order_display_id} was not updated when marking as released — ` +
        `escrow_status not in reconcilable set (${RELEASE_RECONCILABLE_STATUSES.join(', ')})`
    );
  }

  await reconcileWalletLedger(order, payload.txHash);
  logger.info(`[Webhook] Order ${order.order_display_id} marked escrow released (tx: ${payload.txHash})`);
}

async function handleBookingCancelled(payload) {
  const order = await findOrderByIdOrDisplayId(payload.orderId);
  const now = new Date().toISOString();

  if (order.escrow_status === 'refunded') {
    if (payload.txHash && !order.refund_tx_hash) {
      await requireDb().from('orders').update({ refund_tx_hash: payload.txHash }).eq('id', order.id);
    }
    logger.info(`[Webhook] Order ${order.order_display_id} already refunded — duplicate delivery ignored.`);
    return;
  }
  if (!REFUND_RECONCILABLE_STATUSES.includes(order.escrow_status)) {
    throw new EscrowVerificationError(
      'UNEXPECTED_ESCROW_STATUS',
      `Order ${order.order_display_id} has escrow_status ${order.escrow_status}; cannot be refunded by BookingCancelled webhook`,
      { retryable: false },
    );
  }

  const { data: updatedOrders, error } = await requireDb()
    .from('orders')
    .update({
      escrow_status: 'refunded',
      refund_tx_hash: payload.txHash || order.refund_tx_hash || null,
      updated_at: now,
    })
    .eq('id', order.id)
    .in('escrow_status', REFUND_RECONCILABLE_STATUSES)
    .select('id');

  if (error) {
    throw new Error(`Failed to mark order ${order.order_display_id} as refunded: ${error.message}`);
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    throw new Error(
      `Order ${order.order_display_id} was not updated when marking as refunded — ` +
        `escrow_status not in reconcilable set (${REFUND_RECONCILABLE_STATUSES.join(', ')})`
    );
  }

  logger.info(`[Webhook] Order ${order.order_display_id} marked escrow refunded (tx: ${payload.txHash})`);
}

// WithdrawalReady / Withdrawn: the escrowed funds were settled via the
// pull-based withdrawal path (e.g. a driver's direct withdraw()). Reconcile
// the order based on its current escrow state.
async function handleWithdrawalSettled(payload) {
  const order = await findOrderByIdOrDisplayId(payload.orderId);
  const now = new Date().toISOString();
  const txHash = normalizeTxHash(payload.txHash);

  const isRefund = ['refund_pending', 'refund_failed'].includes(order.escrow_status);
  const targetStatus = isRefund ? 'refunded' : 'released';
  const targetStatuses = isRefund ? REFUND_TARGET_STATUSES : RELEASE_TARGET_STATUSES;

  // Idempotent duplicate delivery: the withdrawal was already reconciled.
  if (order.escrow_status === targetStatus) {
    if (txHash && order.release_tx_hash && txHash !== order.release_tx_hash.toLowerCase()) {
      throw new EscrowVerificationError(
        'TX_HASH_CONFLICT',
        `Order ${order.order_display_id} is already ${targetStatus} with a different transaction hash`,
        { retryable: false },
      );
    if (txHash) {
      if (isRefund && !order.refund_tx_hash) {
        await requireDb().from('orders').update({ refund_tx_hash: txHash }).eq('id', order.id);
      } else if (!isRefund && !order.release_tx_hash) {
        await requireDb().from('orders').update({ release_tx_hash: txHash }).eq('id', order.id);
      }
    }
    if (!isRefund) {
      await reconcileWalletLedger(order, txHash || order.release_tx_hash);
    }
    logger.info(`[Webhook] Order ${order.order_display_id} already ${targetStatus} — duplicate delivery ignored.`);
    return;
  }

  assertEscrowEnabled(order);
  if (!targetStatuses.includes(order.escrow_status)) {
    throw new EscrowVerificationError(
      'UNEXPECTED_ESCROW_STATUS',
      `Order ${order.order_display_id} has escrow_status ${order.escrow_status}; cannot be reconciled by withdrawal webhook`,
      { retryable: false },
    );
  }
  if (!txHash) {
    throw new EscrowVerificationError(
      'INVALID_TX_HASH',
      'Withdrawal webhook requires a well-formed 32-byte transaction hash (0x + 64 hex chars)',
      { retryable: false },
    );
  }

  const verification = await verifyPolygonWithdrawalTransaction({ txHash });

  const settlement = isRefund
    ? { escrow_status: 'refunded', refund_tx_hash: verification.txHash, updated_at: now }
    : {
        escrow_status: 'released',
        release_tx_hash: verification.txHash,
        escrow_released_at: now,
        escrow_release_error: null,
        updated_at: now,
      };

  const { data: updatedOrders, error } = await requireDb()
    .from('orders')
    .update(settlement)
    .update({
      escrow_status: isRefund ? 'refunded' : 'released',
      release_tx_hash: isRefund ? undefined : (txHash || order.release_tx_hash || null),
      refund_tx_hash: isRefund ? (txHash || order.refund_tx_hash || null) : undefined,
      escrow_released_at: isRefund ? undefined : now,
      escrow_release_error: isRefund ? undefined : null,
      updated_at: now,
    })
    .eq('id', order.id)
    .in('escrow_status', targetStatuses);
    .in('escrow_status', [...REFUND_RECONCILABLE_STATUSES, ...RELEASE_RECONCILABLE_STATUSES])
    .select('id');

  if (error) {
    if (!isRefund && isUniqueViolation(error)) {
      throw new EscrowVerificationError(
        'TX_HASH_REPLAY',
        `Transaction ${verification.txHash} is already recorded against another order`,
        { retryable: false },
      );
    }
    throw new Error(`Failed to settle order ${order.order_display_id} from withdrawal webhook: ${error.message}`);
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    throw new Error(
      `Order ${order.order_display_id} was not updated when settling from withdrawal webhook — ` +
        `escrow_status not in reconcilable set (${[...REFUND_RECONCILABLE_STATUSES, ...RELEASE_RECONCILABLE_STATUSES].join(', ')})`
    );
  }

  if (!isRefund) {
    await reconcileWalletLedger(order, verification.txHash);
  }

  logger.info(`[Webhook] Order ${order.order_display_id} settled as ${isRefund ? 'refunded' : 'released'} after on-chain verification (tx: ${verification.txHash})`);
}

const EVENT_HANDLERS = {
  PaymentReleased: handlePaymentReleased,
  BookingCancelled: handleBookingCancelled,
  WithdrawalReady: handleWithdrawalSettled,
  Withdrawn: handleWithdrawalSettled,
};

export async function processEscrowWebhookEvent(eventType, payload = {}) {
  if (!eventType) {
    throw new Error('Missing escrow webhook event type');
  }

  const orderId = payload.orderId || 'unknown';
  logger.info(`[Webhook] Processing escrow event ${eventType} for order ${orderId}`);

  const handler = EVENT_HANDLERS[eventType];
  if (!handler) {
    logger.warn(`[Webhook] No handler registered for escrow event ${eventType} — acknowledging without state change.`);
    return { received: true };
  }

  await handler(payload);
  return { received: true };
}
