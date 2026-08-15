import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidDisplayId, getDisplayIdDate } from '../../src/utils/orderDisplayIdValidation.js';

describe('orderDisplayIdValidation', () => {
  describe('isValidDisplayId', () => {
    it('returns true for a valid display ID format', () => {
      // Format: #FF + 8 digits + 12 alphanumeric = 22 chars total
      const valid = '#FF12345678ABCDEF123456';
      expect(isValidDisplayId(valid)).toBe(true);
    });

    it('returns false for wrong prefix', () => {
      expect(isValidDisplayId('#XX12345678ABCDEF123456')).toBe(false);
    });

    it('returns false for wrong length', () => {
      expect(isValidDisplayId('#FF12345678ABCDEF12')).toBe(false);
      expect(isValidDisplayId('#FF12345678ABCDEF1234567')).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(isValidDisplayId(null)).toBe(false);
      expect(isValidDisplayId(undefined)).toBe(false);
      expect(isValidDisplayId(12345)).toBe(false);
      expect(isValidDisplayId({})).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidDisplayId('')).toBe(false);
    });
  });

  describe('getDisplayIdDate', () => {
    it('extracts valid date from a correct display ID', () => {
      expect(getDisplayIdDate('#FF20260815ABCDEFGHI123')).toBe('20260815');
    });

    it('returns date for a valid leap year date', () => {
      expect(getDisplayIdDate('#FF20240229ABCDEFGHI123')).toBe('20240229');
    });

    it('returns null for invalid month (13)', () => {
      expect(getDisplayIdDate('#FF20261315ABCDEFGHI123')).toBeNull();
    });

    it('returns null for invalid month (00)', () => {
      expect(getDisplayIdDate('#FF20260015ABCDEFGHI123')).toBeNull();
    });

    it('returns null for invalid day (32)', () => {
      expect(getDisplayIdDate('#FF20260832ABCDEFGHI123')).toBeNull();
    });

    it('returns null for invalid day (00)', () => {
      expect(getDisplayIdDate('#FF20260800ABCDEFGHI123')).toBeNull();
    });

    it('returns null for invalid date portion 99999999', () => {
      expect(getDisplayIdDate('#FF99999999ABCDEFGHI123')).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(getDisplayIdDate(null)).toBeNull();
      expect(getDisplayIdDate(undefined)).toBeNull();
      expect(getDisplayIdDate(12345)).toBeNull();
    });

    it('returns null for invalid format', () => {
      expect(getDisplayIdDate('#FF20260815')).toBeNull();
    });
  });
});
