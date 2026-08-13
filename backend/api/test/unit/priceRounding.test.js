import { describe, it, expect } from 'vitest';
import { toPaisa, toInr, roundPrice } from '../../src/lib/priceRounding.js';

describe('toPaisa', () => {
  it('converts a valid INR amount to paisa', () => {
    expect(toPaisa(18.5)).toBe(1850);
    expect(toPaisa(1.23)).toBe(123);
  });

  it('rounds to the nearest paisa using banker-style rounding', () => {
    expect(toPaisa(0.005)).toBe(1);
    expect(toPaisa(10.005)).toBe(1001);
  });

  it('handles zero', () => {
    expect(toPaisa(0)).toBe(0);
  });

  it('returns null for null input', () => {
    expect(toPaisa(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(toPaisa(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(toPaisa(Infinity)).toBeNull();
    expect(toPaisa(-Infinity)).toBeNull();
  });

  it('returns null for negative amounts', () => {
    expect(toPaisa(-5)).toBeNull();
    expect(toPaisa(-0.01)).toBeNull();
  });

  it('returns null for non-number input', () => {
    expect(toPaisa('123')).toBeNull();
    expect(toPaisa(undefined)).toBeNull();
  });
});

describe('toInr', () => {
  it('converts a valid paisa amount to INR', () => {
    expect(toInr(100)).toBe(1);
    expect(toInr(123)).toBe(1.23);
  });

  it('handles zero', () => {
    expect(toInr(0)).toBe(0);
  });

  it('returns null for null input', () => {
    expect(toInr(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(toInr(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(toInr(Infinity)).toBeNull();
  });

  it('returns null for negative amounts', () => {
    expect(toInr(-100)).toBeNull();
  });

  it('returns null for non-number input', () => {
    expect(toInr('100')).toBeNull();
    expect(toInr(undefined)).toBeNull();
  });
});

describe('roundPrice', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(roundPrice(1.2)).toBe(1.2);
    expect(roundPrice(2.345)).toBe(2.35);
    expect(roundPrice(2.344)).toBe(2.34);
  });

  it('rounds with a custom decimal count', () => {
    expect(roundPrice(1.23456, 3)).toBe(1.235);
    expect(roundPrice(1.2, 0)).toBe(1);
  });

  it('returns 0 for null input', () => {
    expect(roundPrice(null)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(roundPrice(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(roundPrice(Infinity)).toBe(0);
  });

  it('returns 0 for non-number input', () => {
    expect(roundPrice('1.5')).toBe(0);
  });
});
