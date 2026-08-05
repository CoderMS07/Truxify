import { describe, it, expect, vi, beforeAll } from 'vitest'
import { errorHandler } from '../../src/middleware/errorHandler.js'
import { AppError, NotFoundError } from '../../src/utils/errors.js'

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeRes() {
  const res = { statusCode: 200 }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function makeReq() {
  return {
    requestId: 'req-1',
    ip: '127.0.0.1',
    method: 'GET',
    originalUrl: '/api/test',
  }
}

describe('errorHandler', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'development'
  })

  it('returns 413 for payload-too-large errors', () => {
    const res = makeRes()
    errorHandler({ type: 'entity.too.large' }, makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(413)
    expect(res.body.error).toBe('Payload too large')
  })

  it('returns 400 for malformed JSON', () => {
    const res = makeRes()
    const err = new SyntaxError('bad json')
    err.status = 400
    err.body = undefined
    errorHandler(err, makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Malformed JSON payload')
  })

  it('returns 413 for oversize file uploads', () => {
    const res = makeRes()
    errorHandler({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'too big' }, makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(413)
    expect(res.body.error).toMatch(/File upload error/)
  })

  it('returns 400 for other multer errors', () => {
    const res = makeRes()
    errorHandler({ name: 'MulterError', code: 'UNEXPECTED_FILE', message: 'nope' }, makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(400)
  })

  it('returns the AppError status code', () => {
    const res = makeRes()
    errorHandler(new NotFoundError('gone'), makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('gone')
  })

  it('falls back to 500 for unknown errors', () => {
    const res = makeRes()
    errorHandler(new Error('boom'), makeReq(), res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('Critical Internal Server Error.')
  })

  it('AppError instances carry statusCode', () => {
    expect(AppError.prototype).toBeDefined()
  })
})
