import { describe, it, expect } from 'vitest';
import { safeJsonParseWithFallback } from '../../src/lib/requestContext.js';

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

  it('returns parsed empty object for {}', () => {
    const fallback = { safe: true };
    const result = safeJsonParseWithFallback('{}', fallback);
    expect(result).toEqual({});
  });
});
