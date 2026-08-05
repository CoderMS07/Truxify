import { describe, it, expect, vi } from 'vitest'
import { shardMiddleware } from '../../src/middleware/shardMiddleware.js'

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/services/sharding/ShardManager.js', () => ({
  default: {
    getShardForLocation: vi.fn(() => 'west'),
    getShardConnection: vi.fn((name) => ({ name })),
    redis: { setex: vi.fn().mockResolvedValue('OK') },
  },
}))

function makeReq(query = {}, body = {}) {
  return { query, body, requestId: 'req-1', method: 'GET', originalUrl: '/x' }
}

function makeRes() {
  const headers = {}
  return {
    headers,
    setHeader: (name, value) => { headers[name] = value },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }
}

describe('shardMiddleware', () => {
  it('routes to a shard based on query coordinates', async () => {
    const req = makeReq({ lat: '12.9', lng: '77.5' })
    const res = makeRes()
    const next = vi.fn()
    await shardMiddleware(req, res, next)
    expect(req.shard).toBe('west')
    expect(res.headers['X-Shard']).toBe('west')
    expect(next).toHaveBeenCalled()
  })

  it('rejects invalid coordinates', async () => {
    const req = makeReq({ lat: 'abc', lng: '77.5' })
    const res = makeRes()
    const next = vi.fn()
    await shardMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('uses the default north shard when no coordinates are provided', async () => {
    const req = makeReq()
    const res = makeRes()
    const next = vi.fn()
    await shardMiddleware(req, res, next)
    expect(req.shard).toBe('north')
    expect(next).toHaveBeenCalled()
  })
})
