import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = vi.hoisted(() => ({
  pipeline: vi.fn(),
  zrange: vi.fn(),
}))

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
}))

vi.mock('../../src/config/db.js', () => ({ redisClient: client }))
vi.mock('../../src/middleware/logger.js', () => ({ default: mockLogger }))

const { redisRateLimiter } = await import('../../src/middleware/redisRateLimiter.js')

function makePipeline(execResult) {
  const p = {}
  p.zremrangebyscore = vi.fn(() => p)
  p.zcard = vi.fn(() => p)
  p.zadd = vi.fn(() => p)
  p.pexpire = vi.fn(() => p)
  p.exec = vi.fn().mockResolvedValue(execResult)
  return p
}

function makeRes() {
  return {
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
}

function makeReq() {
  return { ip: '1.2.3.4', user: { id: 'u1' } }
}

describe('redisRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.zrange.mockResolvedValue(['member-1', String(Date.now())])
  })

  it('records the request and calls next when below the limit', async () => {
    client.pipeline.mockImplementation(() => makePipeline([[null, '0'], [null, 1]]))
    const next = vi.fn()
    const res = makeRes()
    await redisRateLimiter({ routeKey: 'r', limit: 5, windowMs: 1000 })(makeReq(), res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 429 when at the limit', async () => {
    client.pipeline.mockImplementation(() => makePipeline([[null, '0'], [null, 5]]))
    const next = vi.fn()
    const res = makeRes()
    await redisRateLimiter({ routeKey: 'r', limit: 5, windowMs: 1000 })(makeReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(Number))
    expect(next).not.toHaveBeenCalled()
  })

  it('fails open to next when zcard reports an error', async () => {
    client.pipeline.mockImplementation(() => makePipeline([[null, '0'], [new Error('zcard down'), null]]))
    const next = vi.fn()
    const res = makeRes()
    await redisRateLimiter({ routeKey: 'r', limit: 5, windowMs: 1000 })(makeReq(), res, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails open to next when redis throws', async () => {
    client.pipeline.mockImplementation(() => { throw new Error('redis down') })
    const next = vi.fn()
    const res = makeRes()
    await redisRateLimiter({ routeKey: 'r', limit: 5, windowMs: 1000 })(makeReq(), res, next)
    expect(next).toHaveBeenCalled()
  })
})
