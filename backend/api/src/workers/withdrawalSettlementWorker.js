import { supabaseAdmin } from '../config/db.js';
import logger from '../middleware/logger.js';
import { dispatchPayout, isPayoutProviderConfigured } from '../services/wallet/payoutProvider.js';
import { WorkerTracer } from '../core/telemetry/WorkerTracer.js';

const BATCH_LIMIT = 50;

let intervalId = null;

/**
 * Settles 'pending' withdrawal wallet_transactions:
 *   1. loads the oldest un-settled pending withdrawals;
 *   2. dispatches the payout through the configured payout provider;
 *   3. marks the withdrawal completed (settle_withdrawal_tx) or failed
 *      (fail_withdrawal_tx) with the reserved funds restored to
 *      wallet_confirmed.
 */
export async function settlePendingWithdrawals() {
  if (!supabaseAdmin) {
    logger.warn('[WithdrawalSettlementWorker] supabaseAdmin unavailable - skipping settlement cycle.');
    return;
  }

  if (!isPayoutProviderConfigured()) {
    logger.warn('[WithdrawalSettlementWorker] No payout provider configured (WITHDRAWAL_PAYOUT_PROVIDER / WITHDRAWAL_PAYOUT_WEBHOOK_URL) - skipping so withdrawals are never falsely completed.');
    return;
  }

  const { data: withdrawals, error } = await supabaseAdmin
    .from('wallet_transactions')
    .select('id, driver_id, amount')
    .eq('txn_type', 'withdrawal')
    .eq('status', 'pending')
    .is('settled_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    logger.error(`[WithdrawalSettlementWorker] Failed to load pending withdrawals: ${error.message}`);
    return;
  }

  if (!withdrawals || withdrawals.length === 0) {
    return;
  }

  for (const withdrawal of withdrawals) {
    try {
      const result = await dispatchPayout({
        driverId: withdrawal.driver_id,
        withdrawal,
      });

      const { error: settleErr } = await supabaseAdmin.rpc('settle_withdrawal_tx', {
        p_withdrawal_id: withdrawal.id,
        p_settlement_ref: result.settlementRef,
      });

      if (settleErr) {
        throw new Error(`Failed to settle withdrawal ${withdrawal.id}: ${settleErr.message}`);
      }

      logger.info(`[WithdrawalSettlementWorker] Settled withdrawal ${withdrawal.id} (ref: ${result.settlementRef}).`);
    } catch (err) {
      logger.error(`[WithdrawalSettlementWorker] Withdrawal ${withdrawal.id} failed: ${err.message}`);

      const { error: failErr } = await supabaseAdmin.rpc('fail_withdrawal_tx', {
        p_withdrawal_id: withdrawal.id,
        p_error: String(err.message || 'Unknown error').slice(0, 1000),
      });

      if (failErr) {
        logger.error(`[WithdrawalSettlementWorker] Failed to mark withdrawal ${withdrawal.id} as failed: ${failErr.message}`);
      }
    }
  }
}

export const startWithdrawalSettlementWorker = () => {
  if (intervalId) return;

  const INTERVAL_MS = 60 * 1000; // Poll every 1 minute

  const tracedHandler = WorkerTracer.wrapIntervalWorker('withdrawal-settlement-worker', async () => {
    await settlePendingWithdrawals();
  }, { intervalMs: INTERVAL_MS });

  intervalId = setInterval(async () => {
    try {
      await tracedHandler();
    } catch (err) {
      logger.error(`[WithdrawalSettlementWorker] Error in polling loop: ${err.message}`);
    }
  }, INTERVAL_MS);

  logger.info('[WithdrawalSettlementWorker] Started wallet withdrawal settlement worker.');
};

export const stopWithdrawalSettlementWorker = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[WithdrawalSettlementWorker] Stopped wallet withdrawal settlement worker.');
  }
};
