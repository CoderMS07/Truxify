/**
 * Unit tests for backend/api/src/lib/requestContext.js
 */
import { describe, it, expect, vi } from 'vitest';
import { requestContext, getRequestCache, safeJsonParseWithFallback } from '../../src/lib/requestContext.js';
import { RequestCache } from '../../src/lib/requestCache.js';

describe('requestContext', () => {
  describe('getRequestCache', () => {
    it('returns null when called outside a request context', () => {
      const cache = getRequestCache();
      expect(cache).toBeNull();
    });

    it('returns the requestCache from the store when inside context.run()', () => {
      const store = { requestCache: new RequestCache() };
      let observedCache = null;

      requestContext.run(store, () => {
        observedCache = getRequestCache();
      });

      expect(observedCache).toBe(store.requestCache);
      expect(observedCache).toBeInstanceOf(RequestCache);
    });

    it('returns null when the store has no requestCache property', () => {
      const store = {};
      let observedCache = null;

      requestContext.run(store, () => {
        observedCache = getRequestCache();
      });

      expect(observedCache).toBeNull();
    });

    it('returns null when the store.requestCache is explicitly null', () => {
      const store = { requestCache: null };
      let observedCache = null;

      requestContext.run(store, () => {
        observedCache = getRequestCache();
      });

describe('requestContext safeJsonParseWithFallback', () => {
  it('returns parsed object for valid JSON object string', () => {
    const result = safeJsonParseWithFallback('{"key":"value"}', null);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns fallback for JSON array string (not an object)', () => {
    const fallback = null;
    const result = safeJsonParseWithFallback('[1, 2, 3]', fallback);
    expect(result).toBe(fallback);
  });

  it('returns fallback for null input', () => {
    const fallback = { default: true };
    expect(safeJsonParseWithFallback(null, fallback)).toBe(fallback);
  });

  it('returns fallback for undefined input', () => {
    const fallback = { default: true };
    expect(safeJsonParseWithFallback(undefined, fallback)).toBe(fallback);
  });

  it('returns fallback for invalid JSON string', () => {
    const fallback = { safe: true };
    expect(safeJsonParseWithFallback('not valid json', fallback)).toBe(fallback);
  });

  it('returns fallback for primitive JSON values', () => {
    const fallback = { safe: true };
    expect(safeJsonParseWithFallback('"just a string"', fallback)).toBe(fallback);
    expect(safeJsonParseWithFallback('123', fallback)).toBe(fallback);
    expect(safeJsonParseWithFallback('true', fallback)).toBe(fallback);
  });

  it('returns fallback for empty string', () => {
    const fallback = { safe: true };
    expect(safeJsonParseWithFallback('', fallback)).toBe(fallback);
  });

// === Spec 1 test ===
import { safeJsonParseWithFallback } from '../../src/lib/requestContext.js';
describe('safeJsonParseWithFallback', () => {
  it('returns parsed object for valid JSON', () => { expect(safeJsonParseWithFallback('{"a":1}', {})).toEqual({ a: 1 }); });
  it('returns fallback for null', () => { expect(safeJsonParseWithFallback(null, { x: 1 })).toEqual({ x: 1 }); });
  it('returns fallback for malformed JSON', () => { expect(safeJsonParseWithFallback('bad{', { y: 2 })).toEqual({ y: 2 }); });
  it('returns fallback for arrays', () => { expect(safeJsonParseWithFallback('[1,2]', { z: 3 })).toEqual({ z: 3 }); });
});


describe('safeJsonParseWithFallback', () => {
  it('parses valid JSON objects', () => {
    expect(safeJsonParseWithFallback('{"key":"value"}', {})).toEqual({ key: 'value' });
    expect(safeJsonParseWithFallback('{"a":1,"b":2}', {})).toEqual({ a: 1, b: 2 });
  });

  it('returns fallback for null', () => {
    expect(safeJsonParseWithFallback(null, { default: true })).toEqual({ default: true });
    expect(safeJsonParseWithFallback(undefined, { fallback: 'x' })).toEqual({ fallback: 'x' });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParseWithFallback('not json', { ok: false })).toEqual({ ok: false });
    expect(safeJsonParseWithFallback('{ broken }', {})).toEqual({});
  });

  it('returns fallback for JSON arrays (only plain objects allowed)', () => {
    expect(safeJsonParseWithFallback('[1,2,3]', [])).toEqual([]);
    expect(safeJsonParseWithFallback('["a","b"]', null)).toBeNull();
  });

  it('returns fallback for JSON primitives', () => {
    expect(safeJsonParseWithFallback('"just a string"', null)).toBeNull();
    expect(safeJsonParseWithFallback('123', null)).toBeNull();
    expect(safeJsonParseWithFallback('true', null)).toBeNull();
  });

  it('uses custom fallback', () => {
    const custom = { custom: true };
    expect(safeJsonParseWithFallback('not valid', custom)).toBe(custom);
  });
});
