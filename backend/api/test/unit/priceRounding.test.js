import { describe, it, expect } from 'vitest'
import { toPaisa, toInr, roundPrice } from '../../src/lib/priceRounding.js'

describe('toPaisa', () => {
  it('converts whole INR to paisa', () => {
    expect(toPaisa(10)).toBe(1000)
    expect(toPaisa(1)).toBe(100)
  })

  it('rounds fractional INR to nearest paisa', () => {
    expect(toPaisa(10.5)).toBe(1050)
    expect(toPaisa(10.999)).toBe(1100)
  })

  it('returns null for non-finite values', () => {
    expect(toPaisa(NaN)).toBe(null)
    expect(toPaisa(Infinity)).toBe(null)
    expect(toPaisa(-1)).toBe(null)
  })

  it('returns null for non-number input', () => {
    expect(toPaisa('10')).toBe(null)
    expect(toPaisa(null)).toBe(null)
    expect(toPaisa(undefined)).toBe(null)
  })
})

describe('toInr', () => {
  it('converts paisa to INR', () => {
    expect(toInr(1000)).toBe(10)
    expect(toInr(1050)).toBe(10.5)
  })

  it('returns null for non-finite values', () => {
    expect(toInr(NaN)).toBe(null)
    expect(toInr(Infinity)).toBe(null)
    expect(toInr(-1)).toBe(null)
  })

  it('returns null for non-number input', () => {
    expect(toInr('1000')).toBe(null)
    expect(toInr(null)).toBe(null)
  })
})

describe('roundPrice', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(roundPrice(10.555)).toBe(10.56)
    expect(roundPrice(10.554)).toBe(10.55)
  })

  it('respects custom decimal places', () => {
    expect(roundPrice(10.5555, 3)).toBe(10.556)
    expect(roundPrice(10.5, 0)).toBe(11)
  })

  it('returns 0 for non-finite values', () => {
    expect(roundPrice(NaN)).toBe(0)
    expect(roundPrice(Infinity)).toBe(0)
    expect(roundPrice('10')).toBe(0)
  })
})
