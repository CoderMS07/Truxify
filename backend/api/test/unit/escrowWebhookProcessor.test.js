import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ethers as actualEthers } from 'ethers';

vi.mock('../../src/middleware/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockGetTransactionReceipt = vi.fn();
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: vi.fn(function JsonRpcProvider() {
        this.getTransactionReceipt = mockGetTransactionReceipt;
      }),
    },
  };
});


const mockQuery = {
  select: vi.fn(function () { return this; }),
  eq: vi.fn(function () { return this; }),
  in: vi.fn(function () { return this; }),
  update: vi.fn(function () { return this; }),
  limit: vi.fn(function () { return this; }),
  maybeSingle: vi.fn(),
  then: (resolve) => resolve({ data: [{ id: 'order-uuid' }], error: null }),
};

const mockSupabaseAdmin = {
  from: vi.fn(() => mockQuery),
};

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

const { processEscrowWebhookEvent } = await import('../../src/services/webhook/escrowWebhookProcessor.js');

describe('processEscrowWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.maybeSingle.mockReset();
    process.env.POLYGON_RPC_URL = 'https://polygon-rpc.example';
    process.env.ESCROW_CONTRACT_ADDRESS = '0xEscrowContract000000000000000000000001';
    mockGetTransactionReceipt.mockResolvedValue({
      status: 1,
      to: '0xEscrowContract000000000000000000000001',
    });
  });

  it('acknowledges unsupported escrow events without changing state', async () => {
    await expect(
      processEscrowWebhookEvent('EscrowDeposited', { orderId: 'order-1' })
    ).resolves.toEqual({ received: true });
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('keeps processor failures visible to the DLQ retry loop', async () => {
    await expect(
      processEscrowWebhookEvent('PaymentReleased', {})
    ).rejects.toThrow('Missing orderId in escrow webhook payload');
  });

  it('rejects payloads without an event type', async () => {
    await expect(processEscrowWebhookEvent(undefined, { orderId: 'order-1' }))
      .rejects.toThrow('Missing escrow webhook event type');
  });

  it('rejects payloads without an orderId', async () => {
    mockQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(processEscrowWebhookEvent('PaymentReleased', {}))
      .rejects.toThrow('Missing orderId in escrow webhook payload');
  });

  it('throws when no order matches the supplied orderId', async () => {
    mockQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(processEscrowWebhookEvent('PaymentReleased', { orderId: 'unknown-order' }))
      .rejects.toThrow('No order found for escrow webhook event');
  });

  it('marks the order released and reconciles the wallet ledger on PaymentReleased', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD1',
      driver_id: 'driver-1',
      escrow_status: 'funded',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: '0xabc' })
    ).resolves.toEqual({ received: true });

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('orders');
    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'released',
      release_tx_hash: '0xabc',
    }));
    expect(mockQuery.in).toHaveBeenCalledWith('escrow_status', ['funded', 'release_failed']);

    const walletTables = mockSupabaseAdmin.from.mock.calls.filter(([table]) => table === 'wallet_transactions');
    expect(walletTables.length).toBeGreaterThan(0);
  });

  it('rejects PaymentReleased when the Polygon receipt is missing or failed', async () => {
    mockGetTransactionReceipt.mockResolvedValueOnce(null);

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: '0xdead' })
    ).rejects.toThrow('Polygon transaction receipt not found');

    mockGetTransactionReceipt.mockResolvedValueOnce({
      status: 0,
      to: '0xEscrowContract000000000000000000000001',
    });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD1', txHash: '0xdead' })
    ).rejects.toThrow('Polygon transaction failed or reverted');

    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('marks the order refunded on BookingCancelled', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD2',
      driver_id: null,
      escrow_status: 'refund_pending',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('BookingCancelled', { orderId: '#OD2', txHash: '0xdef' })
    ).resolves.toEqual({ received: true });

    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'refunded',
      refund_tx_hash: '0xdef',
    }));
    expect(mockQuery.in).toHaveBeenCalledWith('escrow_status', ['funded', 'refund_pending', 'refund_failed']);
  });

  it('settles a funded order as released on WithdrawalReady', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD3',
      driver_id: 'driver-3',
      escrow_status: 'funded',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('WithdrawalReady', { orderId: '#OD3', txHash: '0x111' })
    ).resolves.toEqual({ received: true });

    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'released',
      release_tx_hash: '0x111',
    }));
  });

  it('settles a pending refund as refunded on Withdrawn', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD4',
      driver_id: null,
      escrow_status: 'refund_pending',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('Withdrawn', { orderId: '#OD4', txHash: '0x222' })
    ).resolves.toEqual({ received: true });

    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'refunded',
      refund_tx_hash: '0x222',
    }));
  });
});

describe('processEscrowWebhookEvent — idempotency (crash-after-side-effect / duplicate delivery)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.maybeSingle.mockReset();
  });

  const updatePayloads = () => mockQuery.update.mock.calls.map(([payload]) => payload);

  it('ignores a duplicate PaymentReleased when the order is already released (no re-applied order effect)', async () => {
    // Simulates worker A having already applied the side effect before
    // crashing; worker B re-processes the reclaimed DLQ row.
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD5',
      driver_id: 'driver-5',
      escrow_status: 'released',
      release_tx_hash: '0xabc',
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD5', txHash: '0xabc' })
    ).resolves.toEqual({ received: true });

    // The order-level effect is NOT re-applied…
    expect(updatePayloads().filter(p => p.escrow_status === 'released')).toHaveLength(0);
    // …but the (idempotent) wallet ledger confirm still runs, healing a crash
    // between the order update and the wallet update.
    expect(updatePayloads().some(p => p.status === 'confirmed')).toBe(true);
  });

  it('ignores a duplicate BookingCancelled when the order is already refunded', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD6',
      driver_id: null,
      escrow_status: 'refunded',
      release_tx_hash: null,
      refund_tx_hash: '0xdef',
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('BookingCancelled', { orderId: '#OD6', txHash: '0xdef' })
    ).resolves.toEqual({ received: true });

    expect(updatePayloads().filter(p => p.escrow_status === 'refunded')).toHaveLength(0);
  });

  it('reconciles the wallet ledger exactly once for a duplicate release (no infinite DLQ re-entry, #12154)', async () => {
    // Released-before-reconcile ordering: a release Webhook re-delivered after
    // the order is already 'released' must NOT re-apply the order effect and
    // must NOT issue a second wallet credit, otherwise the reconciliation loop
    // re-selects the released order forever.
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD8',
      driver_id: 'driver-8',
      escrow_status: 'released',
      release_tx_hash: '0xabc',
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD8', txHash: '0xabc' })
    ).resolves.toEqual({ received: true });

    // Exactly one wallet ledger confirm, and never a second 'released' write.
    const walletConfirms = updatePayloads().filter(p => p.status === 'confirmed');
    expect(walletConfirms).toHaveLength(1);
    expect(updatePayloads().filter(p => p.escrow_status === 'released')).toHaveLength(0);
  });

  it('ignores a duplicate WithdrawalReady when the order is already released', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD7',
      driver_id: 'driver-7',
      escrow_status: 'released',
      release_tx_hash: '0x111',
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('WithdrawalReady', { orderId: '#OD7' })
    ).resolves.toEqual({ received: true });

    expect(updatePayloads().filter(p => p.escrow_status === 'released')).toHaveLength(0);
  });
});

describe('regression: wallet ledger must not multiply the net credit across drivers (#12155)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.maybeSingle.mockReset();
    process.env.POLYGON_RPC_URL = 'https://polygon-rpc.example';
    process.env.ESCROW_CONTRACT_ADDRESS = '0xEscrowContract000000000000000000000001';
    mockGetTransactionReceipt.mockResolvedValue({
      status: 1,
      to: '0xEscrowContract000000000000000000000001',
    });
  });

  it('reconciles the wallet ledger exactly once per release (no per-driver multiplication)', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD8',
      driver_id: 'driver-1',
      escrow_status: 'funded',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD8', txHash: '0xabc' })
    ).resolves.toEqual({ received: true });

    // The on-chain release transfers a single net amount. The wallet ledger must
    // be reconciled exactly once for the order's driver — never once per grouped
    // driver, which would over-credit by (n-1) × net_amount.
    const walletUpdateIndexes = mockSupabaseAdmin.from.mock.calls
      .map(([table], i) => (table === 'wallet_transactions' ? i : -1))
      .filter((i) => i !== -1);
    expect(walletUpdateIndexes).toHaveLength(1);
    expect(mockQuery.update.mock.calls[walletUpdateIndexes[0]][0]).toEqual(
      expect.objectContaining({ status: 'confirmed' })
    );
  });
});

describe('processEscrowWebhookEvent — receipt amount bound to escrow event logs (issue #14709)', () => {
  // The relayer's `msg.value` is 0 for contract-initiated payouts/cancels, and
  // ethers v6 does not populate a `value` field on the TransactionReceipt, so
  // the moved wei must be read from the contract's emitted event logs.
  const escrowIface = new actualEthers.Interface([
    'event PaymentReleased(uint256 indexed bookingId, address indexed driver, uint256 amount)',
    'event BookingCancelled(uint256 indexed bookingId, address indexed customer, uint256 refundAmount)',
  ]);

  const ESCROW_ADDR = '0xEscrowContract000000000000000000000000001';

  function buildLog(eventName, indexedArgs, nonIndexedArgs) {
    const fragment = escrowIface.getEvent(eventName);
    const { data, topics } = escrowIface.encodeEventLog(fragment, [
      ...indexedArgs,
      ...nonIndexedArgs,
    ]);
    return { address: ESCROW_ADDR, topics, data };
  }

  function receiptWith(logs, value = 0n) {
    return { status: 1, to: ESCROW_ADDR, value, logs };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.maybeSingle.mockReset();
    process.env.POLYGON_RPC_URL = 'https://polygon-rpc.example';
    process.env.ESCROW_CONTRACT_ADDRESS = ESCROW_ADDR;
  });

  it('marks released using the amount carried in the PaymentReleased event log (receipt.value is 0)', async () => {
    const amountWei = '4000000000000';
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD9',
      driver_id: 'driver-9',
      escrow_status: 'funded',
      escrow_amount_wei: amountWei,
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });
    mockGetTransactionReceipt.mockResolvedValue(
      receiptWith([buildLog('PaymentReleased', [1n, '0x0000000000000000000000000000000000000009'], [BigInt(amountWei)])])
    );

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD9', txHash: '0xabc', escrow_booking_id: '1' })
    ).resolves.toEqual({ received: true });

    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'released',
      release_tx_hash: '0xabc',
    }));
  });

  it('marks refunded using the amount carried in the BookingCancelled event log (receipt.value is 0)', async () => {
    const amountWei = '4000000000000';
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD10',
      driver_id: null,
      escrow_status: 'refund_pending',
      escrow_amount_wei: amountWei,
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });
    mockGetTransactionReceipt.mockResolvedValue(
      receiptWith([buildLog('BookingCancelled', [2n, '0x000000000000000000000000000000000000000A'], [BigInt(amountWei)])])
    );

    await expect(
      processEscrowWebhookEvent('BookingCancelled', { orderId: '#OD10', txHash: '0xdef', escrow_booking_id: '2' })
    ).resolves.toEqual({ received: true });

    expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      escrow_status: 'refunded',
      refund_tx_hash: '0xdef',
    }));
  });

  it('throws when the event-log amount does not match the escrow amount', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD11',
      driver_id: 'driver-11',
      escrow_status: 'funded',
      escrow_amount_wei: '4000000000000',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });
    mockGetTransactionReceipt.mockResolvedValue(
      receiptWith([buildLog('PaymentReleased', [3n, '0x000000000000000000000000000000000000000B'], [123n])])
    );

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD11', txHash: '0xabc', escrow_booking_id: '3' })
    ).rejects.toThrow('does not match escrow amount');
  });

  it('throws when the receipt carries no escrow event log for the release', async () => {
    const order = {
      id: 'order-uuid',
      order_display_id: '#OD12',
      driver_id: 'driver-12',
      escrow_status: 'funded',
      escrow_amount_wei: '4000000000000',
      release_tx_hash: null,
      refund_tx_hash: null,
    };
    mockQuery.maybeSingle.mockResolvedValue({ data: order, error: null });
    // No logs at all (and receipt.value is 0 / undefined) — the old code keyed
    // off receipt.value and would always fail here; the new code expects the
    // correct amount in the event log.
    mockGetTransactionReceipt.mockResolvedValue(receiptWith([], 0n));

    await expect(
      processEscrowWebhookEvent('PaymentReleased', { orderId: '#OD12', txHash: '0xabc', escrow_booking_id: '4' })
    ).rejects.toThrow('carries no PaymentReleased amount');
  });
});
