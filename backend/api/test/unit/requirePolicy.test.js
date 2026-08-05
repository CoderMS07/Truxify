import { describe, it, expect, vi } from 'vitest'

class PolicyError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const authorize = vi.fn()

vi.mock('../../src/security/policyEngine.js', () => ({
  PolicyError,
  policy: {
    authorize(user, action, resource) {
      return authorize(user, action, resource)
    },
  },
}))

const { requirePolicy } = await import('../../src/middleware/requirePolicy.js')

function makeRes() {
  const res = { statusCode: 200 }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

describe('requirePolicy middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when req.user is missing', () => {
    const res = makeRes()
    requirePolicy('read')({ user: null }, res, vi.fn())
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toMatch(/authenticated/)
  })

  it('calls next when authorization passes without a resource', () => {
    const next = vi.fn()
    authorize.mockReturnValue(undefined)
    requirePolicy('read')({ user: { id: 'u1' } }, makeRes(), next)
    expect(authorize).toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('returns the policy error status when authorization is denied', () => {
    const res = makeRes()
    authorize.mockImplementation(() => { throw new PolicyError(403, 'forbidden') })
    requirePolicy('read')({ user: { id: 'u1' } }, res, vi.fn())
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('forbidden')
  })

  it('returns 500 for unexpected authorization errors', () => {
    const res = makeRes()
    authorize.mockImplementation(() => { throw new Error('boom') })
    requirePolicy('read')({ user: { id: 'u1' } }, res, vi.fn())
    expect(res.statusCode).toBe(500)
  })

  it('authorizes with the resolved resource when getResource is provided', async () => {
    authorize.mockImplementation(() => { throw new PolicyError(403, 'no') })
    const getResource = vi.fn().mockResolvedValue({ ownerId: 'u1' })
    const res = makeRes()
    requirePolicy('update', getResource)({ user: { id: 'u2' } }, res, vi.fn())
    await Promise.resolve()
    await Promise.resolve()
    expect(getResource).toHaveBeenCalled()
    expect(authorize).toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })
})
