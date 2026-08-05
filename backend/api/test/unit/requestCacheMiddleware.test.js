import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { requestCacheMiddleware } from '../../src/middleware/requestCacheMiddleware.js'
import { getRequestCache } from '../../src/lib/requestContext.js'

function makeRes() {
  const emitter = new EventEmitter()
  emitter.statusCode = 200
  return emitter
}

describe('requestCacheMiddleware', () => {
  it('runs the handler inside a request context that exposes a cache', () => {
    const req = { method: 'GET' }
    const res = makeRes()
    let cacheRef = null
    const next = vi.fn(() => {
      cacheRef = getRequestCache()
    })

    requestCacheMiddleware(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(cacheRef).not.toBeNull()
  })

  it('clears the cache when the response emits finish', () => {
    const req = { method: 'POST' }
    const res = makeRes()
    let cacheRef = null
    const next = () => {
      cacheRef = getRequestCache()
      cacheRef.set('key', 'value')
    }

    requestCacheMiddleware(req, res, next)
    expect(cacheRef.get('key')).toBe('value')

    res.emit('finish')
    expect(cacheRef.get('key')).toBeUndefined()
  })
})
