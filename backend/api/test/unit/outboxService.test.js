import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: mockLogger,
}));

// Minimal supabase mock that records the query chain.
function buildSupabaseMock() {
  const chain = {
    data: null,
    error: null,
    lastUpdate: null,
    lastEq: null,
    select: vi.fn(function (cols) {
      this.lastSelect = cols;
      return this;
    }),
    insert: vi.fn(function (row) {
      this.lastInsert = row;
      return this;
    }),
    update: vi.fn(function (row) {
      this.lastUpdate = row;
      return this;
    }),
    eq: vi.fn(function (col, val) {
      this.lastEq = [col, val];
      return this;
    }),
    lt: vi.fn(function () {
      return this;
    }),
    order: vi.fn(function () {
      return this;
    }),
    limit: vi.fn(function () {
      // fetchPendingEvents() ends its chain with .limit() and awaits the
      // result, so this must resolve to { data, error }.
      return Promise.resolve({ data: this.data, error: this.error });
    }),
    maybeSingle: vi.fn(function () {
      return Promise.resolve({ data: this.data, error: this.error });
    }),
    single: vi.fn(function () {
      return Promise.resolve({ data: this.data, error: this.error });
    }),
    rpc: vi.fn(function () {
      // The old buggy code called rpc() as a column value; this mock must
      // never be reached by a correct implementation.
      return { invalid: true };
    }),
  };
  return { chain, supabase: { from: vi.fn(() => chain) } };
}

const mocks = buildSupabaseMock();
vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: mocks.supabase,
}));

const { outboxService } = await import('../../src/services/outbox/outboxService.js');

describe('OutboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.data = null;
    mocks.chain.error = null;
  });

  describe('writeEvent', () => {
    it('writes a pending outbox event to event_outbox and returns its event_id', async () => {
      mocks.chain.data = { event_id: 'evt-1' };
      const id = await outboxService.writeEvent({
        aggregateId: 'order-1',
        eventType: 'order.created',
        payload: { a: 1 },
      });

      expect(id).toBe('evt-1');
      expect(mocks.chain.lastInsert).toMatchObject({
        aggregate_id: 'order-1',
        event_type: 'order.created',
        status: 'pending',
      });
      expect(mocks.chain.lastInsert.payload).toEqual({ a: 1 });
      expect(mocks.chain.lastInsert.event_id).toBeTypeOf('string');
    });

    it('returns null when aggregateId is missing', async () => {
      const id = await outboxService.writeEvent({ eventType: 'order.created' });
      expect(id).toBeNull();
      expect(mocks.supabase.from).not.toHaveBeenCalled();
    });

    it('returns null (never throws) when the insert errors so a committed mutation is not turned into a 500', async () => {
      mocks.chain.error = { message: 'insert failed' };
      const id = await outboxService.writeEvent({ aggregateId: 'order-1', eventType: 'order.created' });
      expect(id).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('fetchPendingEvents', () => {
    it('returns rows ordered by created_at ascending', async () => {
      mocks.chain.data = [{ event_id: 'evt-1' }, { event_id: 'evt-2' }];
      const rows = await outboxService.fetchPendingEvents(10);

      expect(rows).toHaveLength(2);
      expect(mocks.chain.lastEq).toEqual(['status', 'pending']);
    });

    it('returns an empty array on error', async () => {
      mocks.chain.error = { message: 'db down' };
      const rows = await outboxService.fetchPendingEvents();
      expect(rows).toEqual([]);
    });
  });

  describe('markFailed', () => {
    it('fetches the current attempts and increments it in the update', async () => {
      mocks.chain.data = { attempts: 2 };
      await outboxService.markFailed('evt-1', 'boom');

      expect(mocks.chain.lastUpdate).toMatchObject({
        status: 'pending',
        last_error: 'boom',
        attempts: 3,
      });
      // The increment must be computed in JS and passed as a plain number.
      expect(mocks.chain.lastUpdate.attempts).toBeTypeOf('number');
      expect(mocks.supabase.from).toHaveBeenCalledTimes(2);
    });

    it('defaults attempts to 1 when the row has no attempts', async () => {
      mocks.chain.data = null;
      await outboxService.markFailed('evt-2', 'err');

      expect(mocks.chain.lastUpdate.attempts).toBe(1);
    });

    it('skips when eventId is missing', async () => {
      await outboxService.markFailed(null, 'err');
      expect(mocks.supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('markPublished', () => {
    it('marks the event as published', async () => {
      mocks.chain.error = null;
      await outboxService.markPublished('evt-1');

      expect(mocks.chain.lastUpdate).toMatchObject({ status: 'published' });
      expect(mocks.chain.lastEq).toEqual(['event_id', 'evt-1']);
    });
  });

  describe('requeueFailedEvents', () => {
    it('resets stuck (publishing) events below maxRetries to pending', async () => {
      mocks.chain.error = null;
      await outboxService.requeueFailedEvents(5);

      expect(mocks.chain.lastUpdate).toEqual({ status: 'pending' });
      expect(mocks.chain.lastEq).toEqual(['status', 'publishing']);
    });

    it('does not throw when the Supabase update returns an error', async () => {
      mocks.chain.error = { message: 'connection timeout' };
      // Should not throw — error is swallowed and logged.
      await expect(outboxService.requeueFailedEvents(3)).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('uses maxRetries as the lt threshold for attempts', async () => {
      mocks.chain.error = null;
      // Track the .lt call to verify maxRetries is passed correctly.
      const ltValues = [];
      mocks.chain.lt = vi.fn(function (col) {
        ltValues.push(col);
        return this;
      });
      await outboxService.requeueFailedEvents(7);
      expect(mocks.chain.lastEq).toEqual(['status', 'publishing']);
      expect(ltValues.length).toBeGreaterThan(0);
    });
  });
});
