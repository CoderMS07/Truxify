import { describe, it, expect } from 'vitest';
import { encodeWithSizeHeader, decodeWithSizeHeader } from '../../reed_solomon.js';
describe('size header', () => {
  it('roundtrip', () => {
    const d = decodeWithSizeHeader(encodeWithSizeHeader(Buffer.from('hi'), 2));
    expect(d.originalSize).toBe(2);
  });
  it('short', () => { expect(() => decodeWithSizeHeader(Buffer.alloc(4))).toThrow(); });
});
