import { describe, it, expect } from 'vitest';
import { parseBitmapHeader } from '../../roaring_bitmap.js';
describe('header', () => {
  it('valid', () => { const b = Buffer.alloc(8); b.writeUInt32BE(2, 0); expect(parseBitmapHeader(b).containerCount).toBe(2); });
  it('short', () => { expect(() => parseBitmapHeader(Buffer.alloc(2))).toThrow(); });
});
