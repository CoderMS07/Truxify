import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const verifierMock = vi.hoisted(() => ({
  verifyEscrow: vi.fn(),
  verifyWithdrawal: vi.fn(),
}));

const dbState = vi.hoisted(() => ({
  updates: [],
  orderResult: { data: null, error: null },
  walletResult: { data: null, error: null },
  replayResult: { data: null, error: null },
  updateError: null,
}));

vi.mock('../../src/services/webhook/escrowVerification.js', () => ({
  EscrowVerificationError: class EscrowVerificationError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'EscrowVerificationError';
      this.code = code;
      this.retryable = options.retryable !== false;
    }
  },
  normalizeTxHash: (tx) => {
    if (typeof tx !== 'string') return null;
    const trimmed = tx.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return null;
    return trimmed.toLowerCase();
  },
  verifyPolygonEscrowTransaction: verifierMock.verifyEscrow,
  verifyPolygonWithdrawalTransaction: verifierMock.verifyWithdrawal,
}));

class MockQuery {
  constructor(table) {
    this.table = table;
    this.selectCols = '';
    this.hasUpdated = false;
  }

  select(cols) {
    this.selectCols = cols;
    return this;
  }

  eq() {
    return this;
  }

  neq() {
    return this;
  }

  in() {
    return this;
  }

  limit() {
    return this;
  }

  update(payload) {
    this.hasUpdated = true;
    dbState.updates.push({ table: this.table, payload });
    return this;
  }

  maybeSingle() {
    if (this.selectCols.includes('escrow_amount_wei')) return Promise.resolve(dbState.orderResult);
    if (this.selectCols.includes('polygon_wallet_address')) return Promise.resolve(dbState.walletResult);
    return Promise.resolve(dbState.replayResult);
  }

  then(resolve) {
    if (this.hasUpdated) {
      resolve({ error: dbState.updateError, data: dbState.updateError ? null : {} });
      return;
    }
    resolve({ data: null, error: null });
  }
}

const mockSupabaseAdmin = {
  from: vi.fn((table) => new MockQuery(table)),
};

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

const { processEscrowWebhookEvent } = await import('../../src/services/webhook/escrowWebhookProcessor.js');

const TX = `0x${'ab'.repeat(32)}`;
const TX_OTHER = `0x${'cd'.repeat(32)}`;

function makeOrder(overrides = {}) {
  return {
    id: 'order-uuid',
    order_display_id: '#OD1',
    driver_id: 'driver-1',
    escrow_status: 'funded',
    release_tx_hash: null,
    refund_tx_hash: null,
    escrow_amount_wei: 0,
    escrow_disabled: false,
    status: 'delivered',
    ...overrides,
  };
}

function resetDbState() {
  dbState.updates.length = 0;
  dbState.orderResult = { data: null, error: null };
  dbState.walletResult = { data: null, error: null };
  dbState.replayResult = { data: null, error: null };
  dbState.updateError = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDbState();
  verifierMock.verifyEscrow.mockResolvedValue({ ok: true, txHash: TX, blockNumber: 195, confirmations: 6 });
  verifierMock.verifyWithdrawal.mockResolvedValue({ ok: true, txHash: TX, blockNumber: 195, confirmations: 6 });
});

describe('processEscrowWebhookEvent', () => {
  it('acknowledges unsupported escrow events without changing state', async () => {
    await expect(
      processEscrowWebhookEvent('EscrowDeposited', { orderId: 'order-1' })
    ).resolves.toEqual({ received: true });
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('keeps processor failures visible to the DLQ retry loop', async () => {
    await expect(
      processEscrowWebhookEvent('EscrowDeposited', {
        orderId: 'order-1',
        simulateFailure: true,
      })
    ).rejects.toThrow('Simulated database lock or processing failure');
  });

  it('rejects payloads without an event type', async () => {
    await expect(processEscrowWebhookEvent(undefined, { orderId: 'order-1' }))
      .rejects.toThrow('Missing escrow webhook event type');
  });

  it('rejects payloads without an orderId', async () => {
    await expect(processEscrowWebhookEvent('PaymentReleased', {}))
      .rejects.toThrow('Missing orderId in escrow webhook payload');
  });

  it('throws when no order matches the supplied orderId', async () => {
    await expect(processEscrowWebhookEvent('PaymentReleased', { orderId: 'unknown-order' }))
      .rejects.toThrow('No order found for escrow webhook event');
  });
});

describe('processEscrowWebhookEvent — PaymentReleased', () => {
  it('requires a well-formed 32-byte transaction hash before any verification or write', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: '0xabc' })
    ).rejects.toMatchObject({ code: 'INVALID_TX_HASH', retryable: false });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1' })
    ).rejects.toMatchObject({ code: 'INVALID_TX_HASH', retryable: false });

    expect(verifierMock.verifyEscrow).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it('verifies on-chain, marks the order released and reconciles the wallet ledger', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).resolves.toEqual({ received: true });

    // On-chain verification is the gate BEFORE any DB write.
    expect(verifierMock.verifyEscrow).toHaveBeenCalledWith({
      txHash: TX,
      orderDisplayId: '#OD1',
      driverWalletAddress: null,
      expectedAmountWei: 0,
    });

    const orderUpdate = dbState.updates.find(u => u.table === 'orders');
    expect(orderUpdate).toBeDefined();
    expect(orderUpdate.payload).toEqual(expect.objectContaining({
      escrow_status: 'released',
      release_tx_hash: TX,
    }));
    expect(orderUpdate.payload.escrow_release_error).toBeNull();

    const walletUpdate = dbState.updates.find(u => u.table === 'wallet_transactions');
    expect(walletUpdate).toBeDefined();
    expect(walletUpdate.payload.status).toBe('confirmed');
  });

  it('passes the driver wallet for the soft correlation check when available', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };
    dbState.walletResult = {
      data: { polygon_wallet_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      error: null,
    };

    await processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX });

    expect(verifierMock.verifyEscrow).toHaveBeenCalledWith(expect.objectContaining({
      driverWalletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }));
  });

  it('refuses orders that are not escrow-backed (escrow_disabled)', async () => {
    dbState.orderResult = { data: makeOrder({ escrow_disabled: true }), error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toMatchObject({ code: 'ESCROW_DISABLED', retryable: false });

    expect(verifierMock.verifyEscrow).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it('refuses cancelled orders', async () => {
    dbState.orderResult = { data: makeOrder({ status: 'cancelled' }), error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toMatchObject({ code: 'ORDER_CANCELLED', retryable: false });

    expect(verifierMock.verifyEscrow).not.toHaveBeenCalled();
  });

  it('refuses orders that were never escrow-funded (unexpected escrow status)', async () => {
    dbState.orderResult = { data: makeOrder({ escrow_status: 'pending' }), error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toMatchObject({ code: 'UNEXPECTED_ESCROW_STATUS', retryable: false });

    expect(verifierMock.verifyEscrow).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it('detects a replay of a release transaction already recorded on another order', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };
    dbState.replayResult = { data: { id: 'other', order_display_id: '#OTHER' }, error: null };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toMatchObject({ code: 'TX_HASH_REPLAY', retryable: false });

    // Verification happened, but no order state change was written.
    expect(verifierMock.verifyEscrow).toHaveBeenCalledTimes(1);
    expect(dbState.updates.find(u => u.table === 'orders')).toBeUndefined();
  });

  it('maps a unique-constraint violation on release_tx_hash to a permanent replay error', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };
    dbState.updateError = { code: '23505', message: 'duplicate key value violates unique constraint "idx_orders_release_tx_hash_unique"' };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toMatchObject({ code: 'TX_HASH_REPLAY', retryable: false });
  });

  it('propagates on-chain verification failures without touching the order', async () => {
    dbState.orderResult = { data: makeOrder(), error: null };
    const verifierError = new Error('ORDER_MISMATCH: booking belongs to another order');
    verifierError.retryable = false;
    verifierError.code = 'ORDER_MISMATCH';
    verifierMock.verifyEscrow.mockRejectedValue(verifierError);

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).rejects.toThrow('ORDER_MISMATCH');

    expect(dbState.updates).toHaveLength(0);
  });
});

describe('processEscrowWebhookEvent — idempotency (crash-after-side-effect / duplicate delivery)', () => {
  it('ignores a duplicate PaymentReleased when the order is already released with the same hash', async () => {
    dbState.orderResult = {
      data: makeOrder({ escrow_status: 'released', release_tx_hash: TX }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).resolves.toEqual({ received: true });

    expect(verifierMock.verifyEscrow).not.toHaveBeenCalled();
    expect(dbState.updates.filter(u => u.table === 'orders')).toHaveLength(0);
    // The wallet ledger confirm still runs, healing a crash between the order
    // update and the wallet update.
    expect(dbState.updates.some(u => u.table === 'wallet_transactions')).toBe(true);
  });

  it('rejects a PaymentReleased for an already-released order with a different hash', async () => {
    dbState.orderResult = {
      data: makeOrder({ escrow_status: 'released', release_tx_hash: TX }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX_OTHER })
    ).rejects.toMatchObject({ code: 'TX_HASH_CONFLICT', retryable: false });
  });

  it('heals a released order that has no release_tx_hash on file after verification', async () => {
    dbState.orderResult = {
      data: makeOrder({ escrow_status: 'released', release_tx_hash: null }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: TX })
    ).resolves.toEqual({ received: true });

    expect(verifierMock.verifyEscrow).toHaveBeenCalledTimes(1);
    const orderUpdate = dbState.updates.find(u => u.table === 'orders');
    expect(orderUpdate).toBeDefined();
    expect(orderUpdate.payload.release_tx_hash).toBe(TX);
    expect(orderUpdate.payload).not.toHaveProperty('escrow_status');
  });
});

describe('processEscrowWebhookEvent — BookingCancelled', () => {
  it('marks the order refunded on BookingCancelled', async () => {
    dbState.orderResult = {
      data: makeOrder({ order_display_id: '#OD2', driver_id: null, escrow_status: 'refund_pending', refund_tx_hash: null }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('BookingCancelled', { orderId: '#OD2', txHash: TX })
    ).resolves.toEqual({ received: true });

    const orderUpdate = dbState.updates.find(u => u.table === 'orders');
    expect(orderUpdate.payload).toEqual(expect.objectContaining({
      escrow_status: 'refunded',
      refund_tx_hash: TX,
    }));
  });

  it('ignores a duplicate BookingCancelled when the order is already refunded', async () => {
    dbState.orderResult = {
      data: makeOrder({ order_display_id: '#OD2', driver_id: null, escrow_status: 'refunded', refund_tx_hash: TX }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('BookingCancelled', { orderId: '#OD2', txHash: TX })
    ).resolves.toEqual({ received: true });

    expect(dbState.updates.filter(u => u.table === 'orders')).toHaveLength(0);
  });
});

describe('processEscrowWebhookEvent — WithdrawalReady / Withdrawn', () => {
  it('settles a funded order as released on WithdrawalReady after receipt verification', async () => {
    dbState.orderResult = { data: makeOrder({ order_display_id: '#OD3' }), error: null };

    await expect(
      processEscrowWebhookEvent('WithdrawalReady', { orderId: '#OD3', txHash: TX })
    ).resolves.toEqual({ received: true });

    expect(verifierMock.verifyWithdrawal).toHaveBeenCalledWith({ txHash: TX });
    const orderUpdate = dbState.updates.find(u => u.table === 'orders');
    expect(orderUpdate.payload).toEqual(expect.objectContaining({
      escrow_status: 'released',
      release_tx_hash: TX,
    }));
  });

  it('settles a pending refund as refunded on Withdrawn after receipt verification', async () => {
    dbState.orderResult = {
      data: makeOrder({ order_display_id: '#OD4', driver_id: null, escrow_status: 'refund_pending' }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('Withdrawn', { orderId: '#OD4', txHash: TX })
    ).resolves.toEqual({ received: true });

    expect(verifierMock.verifyWithdrawal).toHaveBeenCalledWith({ txHash: TX });
    const orderUpdate = dbState.updates.find(u => u.table === 'orders');
    expect(orderUpdate.payload).toEqual(expect.objectContaining({
      escrow_status: 'refunded',
      refund_tx_hash: TX,
    }));
  });

  it('ignores a duplicate WithdrawalReady when the order is already released (no re-verification)', async () => {
    dbState.orderResult = {
      data: makeOrder({ order_display_id: '#OD5', escrow_status: 'released', release_tx_hash: TX }),
      error: null,
    };

    await expect(
      processEscrowWebhookEvent('WithdrawalReady', { orderId: '#OD5' })
    ).resolves.toEqual({ received: true });

    expect(verifierMock.verifyWithdrawal).not.toHaveBeenCalled();
    expect(dbState.updates.filter(u => u.table === 'orders')).toHaveLength(0);
  });

  it('rejects a withdrawal webhook without a well-formed transaction hash (permanent)', async () => {
    dbState.orderResult = { data: makeOrder({ order_display_id: '#OD6' }), error: null };

    await expect(
      processEscrowWebhookEvent('WithdrawalReady', { orderId: '#OD6' })
    ).rejects.toMatchObject({ code: 'INVALID_TX_HASH', retryable: false });

    expect(verifierMock.verifyWithdrawal).not.toHaveBeenCalled();
    expect(dbState.updates).toHaveLength(0);
  });

  it('rejects a withdrawal for an order that cannot be settled', async () => {
    dbState.orderResult = { data: makeOrder({ order_display_id: '#OD7', escrow_status: 'pending' }), error: null };

    await expect(
      processEscrowWebhookEvent('Withdrawn', { orderId: '#OD7', txHash: TX })
    ).rejects.toMatchObject({ code: 'UNEXPECTED_ESCROW_STATUS', retryable: false });
  });
});
