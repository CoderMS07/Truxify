import { describe, it, expect } from 'vitest';
import { isValidDisplayId, getDisplayIdDate } from '../../src/utils/orderDisplayIdValidation.js';

describe('orderDisplayIdValidation', () => {
  describe('isValidDisplayId', () => {
    it('accepts valid display ID with correct format', () => {
      expect(isValidDisplayId('#FF20240115ABCDEFGHIJKL')).toBe(true);
    });

    it('accepts another valid display ID', () => {
      expect(isValidDisplayId('#FF20260301XXXX12345678')).toBe(true);
    });

    it('rejects non-string input', () => {
      expect(isValidDisplayId(null)).toBe(false);
      expect(isValidDisplayId(undefined)).toBe(false);
      expect(isValidDisplayId(123)).toBe(false);
      expect(isValidDisplayId({})).toBe(false);
      expect(isValidDisplayId([])).toBe(false);
    });

    it('rejects wrong prefix', () => {
      expect(isValidDisplayId('FF20240115ABCDEFGHIJKL')).toBe(false);
      expect(isValidDisplayId('#XX20240115ABCDEFGHIJKL')).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(isValidDisplayId('#FF20240115ABCDEFGHIJK')).toBe(false);
      expect(isValidDisplayId('#FF20240115ABCDEFGHIJKLMN')).toBe(false);
    });

    it('rejects wrong date format', () => {
      expect(isValidDisplayId('#FFabcdefghABCDEFGHIJKL')).toBe(false);
    });

    it('rejects lowercase letters in random portion', () => {
      expect(isValidDisplayId('#FF20240115abcdefghijk')).toBe(false);
    });
  });

  describe('getDisplayIdDate', () => {
    it('extracts YYYYMMDD from valid display ID', () => {
      expect(getDisplayIdDate('#FF20240115ABCDEFGHIJKL')).toBe('20240115');
      expect(getDisplayIdDate('#FF20260314XYZ123456789')).toBe('20260314');
    });

    it('returns null for invalid display ID', () => {
      expect(getDisplayIdDate(null)).toBe(null);
      expect(getDisplayIdDate('not-a-display-id')).toBe(null);
      expect(getDisplayIdDate('#FFabcdefghABCDEFGHIJKL')).toBe(null);
    });

    it('returns null for non-string input', () => {
      expect(getDisplayIdDate(123)).toBe(null);
      expect(getDisplayIdDate({})).toBe(null);
    });
  });
});
