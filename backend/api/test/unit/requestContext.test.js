import { describe, it, expect, vi } from 'vitest'
import { requestContext, getRequestCache } from '../../src/lib/requestContext.js'

describe('requestContext AsyncLocalStorage', () => {
  it('returns null when there is no active request context', () => {
    expect(getRequestCache()).toBeNull()
  })

  it('exposes the request cache inside a run context', () => {
    let seen = null
    requestContext.run({ requestCache: { id: 'cache-1' } }, () => {
      seen = getRequestCache()
    })
    expect(seen).toEqual({ id: 'cache-1' })
  })

  it('restores the previous store after run completes', () => {
    expect(getRequestCache()).toBeNull()
  })
})
