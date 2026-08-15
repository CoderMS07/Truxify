import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, isValidCursor } from '../../src/utils/cursorPagination.js';

describe('cursorPagination', () => {
  describe('encodeCursor', () => {
    it('encodes a cursor object to base64url', () => {
      const cursor = { id: '123', createdAt: '2026-01-01T00:00:00Z' };
      const encoded = encodeCursor(cursor);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
      // base64url should not contain + or /
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('encodes empty object', () => {
      const encoded = encodeCursor({});
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('encodes nested objects', () => {
      const cursor = { id: 'abc', filter: { status: 'active' }, page: 1 };
      const encoded = encodeCursor(cursor);
      expect(typeof encoded).toBe('string');
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(cursor);
    });
  });

  describe('decodeCursor', () => {
    it('round-trips encoded cursors correctly', () => {
      const original = { id: '123', createdAt: '2026-01-01T00:00:00Z' };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(original);
    });

    it('returns null for null input', () => {
      expect(decodeCursor(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(decodeCursor(undefined)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(decodeCursor(123)).toBeNull();
      expect(decodeCursor({})).toBeNull();
      expect(decodeCursor([])).toBeNull();
    });

    it('returns null for malformed base64', () => {
      expect(decodeCursor('not-valid-base64!!!')).toBeNull();
    });

    it('returns null for valid base64 that is not JSON', () => {
      // A valid base64 string that decodes to non-JSON text
      const encoded = Buffer.from('this is not json').toString('base64url');
      expect(decodeCursor(encoded)).toBeNull();
    });

    it('returns null for arrays (must be object)', () => {
      const encoded = encodeCursor([1, 2, 3]);
      expect(decodeCursor(encoded)).toBeNull();
    });

    it('returns null for primitives (must be object)', () => {
      expect(decodeCursor(encodeCursor('string'))).toBeNull();
      expect(decodeCursor(encodeCursor(42))).toBeNull();
    });
  });

  describe('isValidCursor', () => {
    it('returns true for valid cursors', () => {
      const cursor = { id: '123' };
      expect(isValidCursor(encodeCursor(cursor))).toBe(true);
    });

    it('returns false for invalid cursors', () => {
      expect(isValidCursor(null)).toBe(false);
      expect(isValidCursor('not-a-valid-cursor')).toBe(false);
      expect(isValidCursor(encodeCursor([1, 2]))).toBe(false);
    });

    it('returns false for tampered cursors', () => {
      const cursor = { id: '123' };
      const encoded = encodeCursor(cursor);
      const tampered = encoded.slice(0, -1) + 'X';
      expect(isValidCursor(tampered)).toBe(false);
    });
  });
});
