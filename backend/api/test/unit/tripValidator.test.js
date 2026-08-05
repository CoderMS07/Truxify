import { describe, it, expect, vi } from 'vitest'
import { tripValidator } from '../../src/middleware/tripValidator.js'

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeRes() {
  const res = { statusCode: 200 }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

describe('tripValidator.validate', () => {
  it('calls next when there is no trip id param', () => {
    const next = vi.fn()
    tripValidator.validate({ params: {} }, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('passes an empty trip id through', () => {
    const next = vi.fn()
    tripValidator.validate({ params: { id: '' } }, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('passes a valid trip id through', () => {
    const next = vi.fn()
    tripValidator.validate({ params: { id: 'trip-123' } }, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })
})
