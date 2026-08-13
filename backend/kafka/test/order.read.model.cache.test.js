/**
 * Unit tests for the bounded read-model projection cache
 * (backend/kafka/cqrs/order.read.model.js).
 *
 * Regression test for issue #11214: the projection cache was a plain `Map`
 * with only lazy expiry, so distinct order ids accumulated forever and memory
 * grew without bound. This verifies the cache is now size-bounded (oldest
 * entry evicted past `cacheMaxSize`) and that expired entries are purged.
 *
 * Run with:  npm test -- test/order.read.model.cache.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/src/config/db.js', () => ({
  supabase: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../../api/src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { OrderReadModel } from '../cqrs/order.read.model.js';

describe('OrderReadModel cache bounds (issue #11214)', () => {
  let readModel;

  beforeEach(() => {
    readModel = new OrderReadModel({ from: vi.fn() });
    readModel.cacheMaxSize = 5;
    readModel.cacheTTL = 1000;
    readModel.cache.clear();
    readModel._sweepCounter = 0;
  });

  it('never exceeds the configured max size', () => {
    for (let i = 0; i < 50; i += 1) {
      readModel._cacheSet(`order-${i}`, { n: i });
    }
    expect(readModel.cache.size).toBeLessThanOrEqual(readModel.cacheMaxSize);
  });

  it('evicts the oldest inserted entry first', () => {
    for (let i = 0; i < 5; i += 1) readModel._cacheSet(`order-${i}`, { n: i });
    // Adding a 6th entry should evict the first one inserted ("order-0").
    readModel._cacheSet('order-5', { n: 5 });
    expect(readModel.cache.has('order-0')).toBe(false);
    expect(readModel.cache.has('order-5')).toBe(true);
  });

  it('drops entries once their TTL elapses', () => {
    readModel.cacheTTL = -1; // already expired
    readModel._cacheSet('order-x', { n: 1 });
    expect(readModel._cacheGet('order-x')).toBeUndefined();
    expect(readModel.cache.has('order-x')).toBe(false);
  });

  it('_sweepExpiredCache removes stale entries but keeps fresh ones', () => {
    readModel.cacheTTL = 10000;
    readModel._cacheSet('fresh', { n: 1 });
    readModel.cache.set('stale', { data: { n: 2 }, timestamp: Date.now() - 999999 });
    readModel._sweepExpiredCache();
    expect(readModel.cache.has('fresh')).toBe(true);
    expect(readModel.cache.has('stale')).toBe(false);
  });
});
