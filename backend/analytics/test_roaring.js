import { describe, it, expect } from 'vitest';
import { bitmapOr, alignPrefix16 } from '../../roaring_bitmap.js';
describe('bitmapOr', () => {
  it('OR', () => { expect(bitmapOr({prefix:1, bits:0b01}, {prefix:1, bits:0b10}).bits).toBe(0b11); });
  it('mismatch', () => { expect(() => bitmapOr({prefix:1, bits:0}, {prefix:2, bits:0})).toThrow(); });
});
