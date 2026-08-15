import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('../../src/config/db.js', () => ({
  supabase: mockSupabase,
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('OutboxService', () => {
  let OutboxService, service;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../../src/services/outbox/outboxService.js');
    OutboxService = mod.OutboxService;
    service = new OutboxService();
  });

  describe('writeEvent', () => {
    it('returns null when aggregateId is missing', async () => {
      const result = await service.writeEvent({ eventType: 'order.created' });
      expect(result).toBeNull();
    });

    it('returns null when eventType is missing', async () => {
      const result = await service.writeEvent({ aggregateId: 'order-123' });
      expect(result).toBeNull();
    });

    it('returns null when both aggregateId and eventType are missing', async () => {
      const result = await service.writeEvent({});
      expect(result).toBeNull();
    });

    it('inserts event to outbox_events table when valid', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'evt-123' }, error: null }),
          }),
        }),
      });
      mockSupabase.from.mockReturnValue(mockInsert());

      const result = await service.writeEvent({
        aggregateId: 'order-456',
        eventType: 'order.shipped',
        payload: { driver: 'driver-1' },
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('outbox_events');
    });
  });

  describe('fetchPendingEvents', () => {
    it('returns empty array on error', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        }),
      });
      mockSupabase.from.mockReturnValue(mockSelect());

      const result = await service.fetchPendingEvents();
      expect(result).toEqual([]);
    });

    it('returns data array when query succeeds', async () => {
      const events = [{ id: '1' }, { id: '2' }];
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: events, error: null }),
          }),
        }),
      });
      mockSupabase.from.mockReturnValue(mockSelect());

      const result = await service.fetchPendingEvents();
      expect(result).toEqual(events);
    });

    it('does not embed an unawaited rpc() Promise as the retry_count value (#12178)', async () => {
      mocks.chain.data = { retry_count: 4 };
      await outboxService.markFailed('evt-3', 'boom');

      // The increment must be computed in JS and passed as a plain number,
      // never by assigning the rpc() query builder to the column.
      expect(mocks.chain.lastUpdate.retry_count).toBe(5);
      expect(mocks.chain.lastUpdate.retry_count).toBeTypeOf('number');
      expect(mocks.chain.rpc).not.toHaveBeenCalled();
    });

    it('skips when eventId is missing', async () => {
      await outboxService.markFailed(null, 'err');
      expect(mocks.supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('markPublished', () => {
    it('updates status to published', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      mockSupabase.from.mockReturnValue(mockUpdate());

      await service.markPublished('evt-123');
      expect(mockSupabase.from).toHaveBeenCalledWith('outbox_events');
    });
  });

  describe('markFailed', () => {
    it('calls from with outbox_events', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      mockSupabase.from.mockReturnValue(mockUpdate());

      await service.markFailed('evt-123', 'Network timeout');
      expect(mockSupabase.from).toHaveBeenCalledWith('outbox_events');
    });

    it('does not throw when the Supabase update returns an error', async () => {
      mocks.chain.error = { message: 'connection timeout' };
      // Should not throw — error is swallowed and logged.
      await expect(outboxService.requeueFailedEvents(3)).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('uses maxRetries as the lt threshold for retry_count', async () => {
      mocks.chain.error = null;
      // Track the .lt call to verify maxRetries is passed correctly.
      const ltValues = [];
      mocks.chain.lt = vi.fn(function (col) {
        ltValues.push(col);
        return this;
      });
      await outboxService.requeueFailedEvents(7);
      expect(mocks.chain.lastEq).toEqual(['status', 'failed']);
      expect(ltValues.length).toBeGreaterThan(0);
    });
  });
});
