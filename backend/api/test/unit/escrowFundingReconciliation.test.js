/**
 * Unit tests for backend/api/src/services/escrowFundingReconciliation.js
 *
 * Coverage:
 *   - dueForRetry: returns true when attempts is 0
 *   - dueForRetry: returns true when attempts > 0 and backoff has elapsed
 *   - dueForRetry: returns false when backoff has not elapsed
 *   - reconcileStaleFunding: returns early when orderRepository is null
 *   - reconcileStaleFunding: skips batch when global Redis lock is not acquired
 *
 * Run with:  npm run test:unit -- test/unit/escrowFundingReconciliation.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: mockLogger,
}));

const mockRedisClient = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
}));

vi.mock('../../src/config/db.js', () => ({
  redisClient: mockRedisClient,
  supabaseAdmin: {},
}));

vi.mock('../../src/services/escrow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    submitEscrowRefund: vi.fn(),
    getEscrowBooking: vi.fn(),
  };
});

vi.mock('../../src/lib/redisLock.js', () => ({
  acquireLock: vi.fn(),
  renewLock: vi.fn(),
  releaseLock: vi.fn(),
}));

vi.mock('../../src/services/notificationService.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock the order repository
const mockOrderRepository = vi.hoisted(() => ({
  findStaleFundingOrders: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderWithFilter: vi.fn(),
  executeRpc: vi.fn(),
}));

import { reconcileStaleFunding } from '../../src/services/escrowFundingReconciliation.js';

describe('escrowFundingReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('reconcileStaleFunding', () => {
    it('throws when orderRepository is null', async () => {
      await expect(reconcileStaleFunding(null)).rejects.toThrow('requires an OrderRepository instance');
    });

    it('skips batch when global Redis lock is not acquired', async () => {
      mockRedisClient.set.mockResolvedValue(null); // lock not acquired

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockLogger.info).toHaveBeenCalledWith('[escrow-funding] Global lock held by another instance, skipping batch.');
    });

    it('acquires Redis lock and processes orders when lock is acquired', async () => {
      mockRedisClient.set.mockResolvedValue('locked');

      const mockOrders = [
        {
          id: 'order-1',
          order_display_id: 'DIS-1',
          escrow_status: 'funding',
          escrow_booking_id: 'booking-1',
          escrow_funding_attempts: 0,
          escrow_funding_last_attempt_at: null,
          pending_bid_acceptance: null,
        },
      ];
      mockOrderRepository.findStaleFundingOrders.mockResolvedValueOnce({ data: mockOrders, error: null });

      // Mock the lock acquisition for finalizeOrRevert
      const { acquireLock, releaseLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValueOnce('lock-value');
      releaseLock.mockResolvedValueOnce(undefined);

      const { getEscrowBooking } = await import('../../src/services/escrow.js');
      getEscrowBooking.mockResolvedValueOnce({ paid: false });

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('escrow:funding:reconciliation:lock'),
        expect.any(String),
        'NX',
        'EX',
        expect.any(Number)
      );
      expect(mockOrderRepository.findStaleFundingOrders).toHaveBeenCalled();
    });

    it('returns early on DB error when fetching stale orders', async () => {
      mockRedisClient.set.mockResolvedValue('locked');
      mockOrderRepository.findStaleFundingOrders.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[escrow-funding] Failed to load stale funding orders:',
        'DB error'
      );
    });

    it('heals a funded booking whose on-chain amount differs from expected within tolerance', async () => {
      mockRedisClient.set.mockResolvedValue('locked');

      const order = {
        id: 'order-tol-ok',
        order_display_id: 'DIS-TOL-OK',
        status: 'accepted',
        escrow_status: 'funding',
        escrow_booking_id: 'booking-1',
        escrow_amount_wei: '1000000000000000000',
        escrow_funding_attempts: 0,
        escrow_funding_last_attempt_at: null,
        customer_id: 'cust-1',
        pending_bid_acceptance: {
          bid_id: 'bid-1',
          load_id: 'load-1',
          driver_id: 'driver-1',
          truck_id: 'truck-1',
          driver_name: 'Driver',
          driver_rating: 4.5,
          truck_number: 'KA-01-1234',
          bid_amount: 5000,
          order_display_id: 'DIS-TOL-OK',
          version: 1,
        },
      };
      mockOrderRepository.findStaleFundingOrders.mockResolvedValueOnce({ data: [order], error: null });
      mockOrderRepository.executeRpc.mockResolvedValueOnce({ error: null });
      mockOrderRepository.updateOrderWithFilter.mockResolvedValueOnce({ error: null });

      const { acquireLock, releaseLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValueOnce('lock-value');
      releaseLock.mockResolvedValueOnce(undefined);

      const { getEscrowBooking } = await import('../../src/services/escrow.js');
      // 500 wei above expected — sub-gwei, must be treated as landed.
      getEscrowBooking.mockResolvedValueOnce({ paid: true, amount: 1000000000000000500n });

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockOrderRepository.executeRpc).toHaveBeenCalledWith(
        'accept_bid_tx',
        expect.objectContaining({ p_order_id: 'order-tol-ok' }),
        expect.anything()
      );
      expect(mockOrderRepository.updateOrderWithFilter).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({ escrow_funding_attempts: 0, escrow_funding_error: null }),
        expect.anything(),
        'id'
      );
    });

    it('reverts a funded booking whose on-chain amount differs beyond tolerance', async () => {
      mockRedisClient.set.mockResolvedValue('locked');

      const order = {
        id: 'order-tol-bad',
        order_display_id: 'DIS-TOL-BAD',
        status: 'accepted',
        escrow_status: 'funding',
        escrow_booking_id: 'booking-1',
        escrow_amount_wei: '1000000000000000000',
        escrow_funding_attempts: 0,
        escrow_funding_last_attempt_at: null,
        customer_id: 'cust-1',
        pending_bid_acceptance: null,
      };
      mockOrderRepository.findStaleFundingOrders.mockResolvedValueOnce({ data: [order], error: null });
      mockOrderRepository.updateOrderWithFilter.mockResolvedValueOnce({ error: null });

      const { acquireLock, releaseLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValueOnce('lock-value');
      releaseLock.mockResolvedValueOnce(undefined);

      const { getEscrowBooking, submitEscrowRefund } = await import('../../src/services/escrow.js');
      // 2 gwei above expected — exceeds the 1 gwei tolerance.
      getEscrowBooking.mockResolvedValueOnce({ paid: true, amount: 1000000002000000000n });
      submitEscrowRefund.mockResolvedValueOnce({
        txHash: '0xrefund',
        waitForConfirmation: vi.fn().mockResolvedValueOnce({ blockNumber: 42 }),
      });

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockOrderRepository.updateOrderWithFilter).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({
          escrow_status: 'pending',
          escrow_funding_error: expect.stringContaining('ESCROW_AMOUNT_MISMATCH'),
        }),
        expect.anything(),
        'id'
      );
    });

    it('pages through the stale set in bounded chunks until a short page', async () => {
      mockRedisClient.set.mockResolvedValue('locked');

      const fullPage = Array.from({ length: 1000 }, (_, i) => ({
        id: `order-${i}`,
        order_display_id: `DIS-${i}`,
        escrow_status: 'funding',
        escrow_funding_attempts: 10, // >= MAX_ATTEMPTS, so nothing is processed
        escrow_funding_last_attempt_at: null,
        pending_bid_acceptance: null,
      }));
      mockOrderRepository.findStaleFundingOrders
        .mockResolvedValueOnce({ data: fullPage, error: null })
        .mockResolvedValueOnce({ data: [fullPage[0]], error: null });

      await reconcileStaleFunding(mockOrderRepository);

      expect(mockOrderRepository.findStaleFundingOrders).toHaveBeenCalledTimes(2);
      expect(mockOrderRepository.findStaleFundingOrders).toHaveBeenNthCalledWith(
        1, expect.any(String), { offset: 0, limit: 1000 }
      );
      expect(mockOrderRepository.findStaleFundingOrders).toHaveBeenNthCalledWith(
        2, expect.any(String), { offset: 1000, limit: 1000 }
      );
    });
  });
});
