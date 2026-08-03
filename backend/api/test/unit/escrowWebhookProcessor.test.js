import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockQuery = {
  select: vi.fn(function () { return this; }),
  eq: vi.fn(function () { return this; }),
  in: vi.fn(function () { return this; }),
  update: vi.fn(function () { return this; }),
  limit: vi.fn(function () { return this; }),
  maybeSingle: vi.fn(),
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
  });

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
