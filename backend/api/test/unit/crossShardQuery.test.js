import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/sharding/ShardManager.js', () => ({
  default: {
    executeCrossShardQuery: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

const { crossShardQuery } = await import('../../src/middleware/shardMiddleware.js');

describe('crossShardQuery middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {};
    res = {};
    next = vi.fn();
  });

  it('attaches executeCrossShard to the request', () => {
    crossShardQuery(req, res, next);
    expect(typeof req.executeCrossShard).toBe('function');
  });

  it('calls next()', () => {
    crossShardQuery(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('executeCrossShard is an async function that returns a promise', () => {
    crossShardQuery(req, res, next);
    const result = req.executeCrossShard('SELECT 1', []);
    expect(result).toBeInstanceOf(Promise);
  });
});
