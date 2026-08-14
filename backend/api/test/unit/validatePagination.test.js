import { describe, it, expect } from 'vitest'
import { validatePagination } from '../../src/lib/validatePagination.js'

describe('validatePagination', () => {
  it('returns correct offset and limit for valid input', () => {
    const result = validatePagination({ page: 1, pageSize: 20 })
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0, limit: 20 })
  })

  it('applies defaults for missing page and pageSize', () => {
    const result = validatePagination({})
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0, limit: 20 })
  })

  it('applies defaults when called with no arguments', () => {
    const result = validatePagination()
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0, limit: 20 })
  })

  it('computes correct offset for page 2 and above', () => {
    const result = validatePagination({ page: 3, pageSize: 20 })
    expect(result).toEqual({ page: 3, pageSize: 20, offset: 40, limit: 20 })
  })

  it('returns error when page is less than 1', () => {
    const result = validatePagination({ page: 0, pageSize: 20 })
    expect(result.error).toBe('page must be >= 1')
  })

  it('returns error when page is non-numeric', () => {
    const result = validatePagination({ page: 'abc', pageSize: 20 })
    expect(result.error).toBe('page must be >= 1')
  })

  it('returns error when pageSize is less than 1', () => {
    const result = validatePagination({ page: 1, pageSize: 0 })
    expect(result.error).toBe('pageSize must be >= 1')
  })

  it('returns error when pageSize exceeds 200', () => {
    const result = validatePagination({ page: 1, pageSize: 201 })
    expect(result.error).toBe('pageSize must be <= 200')
  })

  it('returns error when offset exceeds MAX_OFFSET', () => {
    // page 50001 * pageSize 20 = offset 1,000,000 (exactly MAX_OFFSET), passes
    // page 50001 * pageSize 21 = offset 1,050,021 > MAX_OFFSET 1,000,000, fails
    const result = validatePagination({ page: 50001, pageSize: 21 })
    expect(result.error).toContain('exceeds MAX_OFFSET')
  })

  it('accepts pageSize up to 200', () => {
    const result = validatePagination({ page: 1, pageSize: 200 })
    expect(result.error).toBeUndefined()
    expect(result.pageSize).toBe(200)
  })
})
