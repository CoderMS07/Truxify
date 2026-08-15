import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SHARD_PASSWORD_NORTH = 'mock';
  process.env.SHARD_PASSWORD_SOUTH = 'mock';
  process.env.SHARD_PASSWORD_EAST = 'mock';
  process.env.SHARD_PASSWORD_WEST = 'mock';
});

import { shardMiddleware } from '../../src/middleware/shardMiddleware.js';

describe('shardMiddleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { query: {}, body: {} };
    res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('attaches default shard when no lat/lng supplied', async () => {
    await shardMiddleware(req, res, next);
    expect(req.shard).toBe('north');
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 when lat is provided but lng is missing', async () => {
    req.query.lat = '40.0';
    await shardMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when lng is provided but lat is missing', async () => {
    req.query.lng = '-74.0';
    await shardMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for out-of-range latitude', async () => {
    req.query.lat = '91.0';
    req.query.lng = '-74.0';
    await shardMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for out-of-range longitude', async () => {
    req.query.lat = '40.0';
    req.query.lng = '-181.0';
    await shardMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
