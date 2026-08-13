import { describe, it, expect } from 'vitest';
import { toPaisa, toInr, roundPrice } from '../../src/lib/priceRounding.js';

describe('priceRounding', () => {
  describe('toPaisa', () => {
    it('converts INR to paisa', () => {
      expect(toPaisa(100)).toBe(10000);
      expect(toPaisa(1.5)).toBe(150);
      expect(toPaisa(0.01)).toBe(1);
    });

    it('returns null for NaN', () => {
      expect(toPaisa(NaN)).toBe(null);
    });

    it('returns null for negative values', () => {
      expect(toPaisa(-5)).toBe(null);
    });

    it('returns null for non-finite numbers', () => {
      expect(toPaisa(Infinity)).toBe(null);
      expect(toPaisa(-Infinity)).toBe(null);
    });

    it('returns null for non-number input', () => {
      expect(toPaisa('hundred')).toBe(null);
      expect(toPaisa(null)).toBe(null);
    });

    it('returns 0 for zero', () => {
      expect(toPaisa(0)).toBe(0);
    });
  });

  describe('toInr', () => {
    it('converts paisa to INR', () => {
      expect(toInr(10000)).toBe(100);
      expect(toInr(150)).toBe(1.5);
      expect(toInr(1)).toBe(0.01);
    });

    it('returns null for NaN', () => {
      expect(toInr(NaN)).toBe(null);
    });

    it('returns null for negative values', () => {
      expect(toInr(-5)).toBe(null);
    });

    it('returns 0 for zero', () => {
      expect(toInr(0)).toBe(0);
    });
  });

  describe('roundPrice', () => {
    it('rounds to 2 decimals by default', () => {
      expect(roundPrice(1.555)).toBe(1.56);
    });

    it('returns 0 for NaN', () => {
      expect(roundPrice(NaN)).toBe(0);
    });

    it('rounds to custom decimal places', () => {
      expect(roundPrice(1.555, 1)).toBe(1.6);
      expect(roundPrice(1.555, 3)).toBe(1.555);
    });

    it('handles boundary values', () => {
      expect(roundPrice(0.005, 2)).toBe(0.01);
      expect(roundPrice(0.0049, 2)).toBe(0);
    });

    it('handles large numbers', () => {
      expect(roundPrice(1000000.999, 2)).toBe(1000001);
    });
  });
});
