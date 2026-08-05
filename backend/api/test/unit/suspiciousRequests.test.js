import { describe, it, expect, vi } from 'vitest'
import suspiciousRequests from '../../src/middleware/suspiciousRequests.js'

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeRes() {
  const res = { statusCode: 200 }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function invoke(overrides = {}) {
  const req = {
    body: {},
    query: {},
    originalUrl: '/api/orders',
    headers: {},
    method: 'POST',
    ...overrides,
  }
  const res = makeRes()
  let nextCalled = false
  suspiciousRequests(req, res, () => { nextCalled = true })
  return { req, res, nextCalled }
}

describe('suspiciousRequests middleware', () => {
  it('passes clean requests through', () => {
    const { req, nextCalled } = invoke({ body: { name: 'hello' } })
    expect(nextCalled).toBe(true)
    expect(req.suspicious).toBeUndefined()
  })

  it('blocks SQL injection in the body', () => {
    const { res, nextCalled } = invoke({ body: { q: "1 OR 1=1--" } })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  it('blocks path traversal in the URL', () => {
    const { res, nextCalled } = invoke({ originalUrl: '/api/../etc/passwd' })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  it('flags XSS but does not block', () => {
    const { req, nextCalled } = invoke({ body: { note: '<script>alert(1)</script>' } })
    expect(nextCalled).toBe(true)
    expect(req.suspicious).toBe(true)
    expect(req.threatFindings).toContain('Cross-Site Scripting')
  })

  it('flags a suspicious user agent but does not block', () => {
    const { req, nextCalled } = invoke({ headers: { 'user-agent': 'sqlmap 1.5' } })
    expect(nextCalled).toBe(true)
    expect(req.threatFindings).toContain('Suspicious User Agent')
  })
})
