import { describe, it, expect } from 'vitest';
import { bitmapXor } from '../../roaring_bitmap.js';
describe('xor', () => {
  it('xors', () => { expect(bitmapXor([0b1100], [0b1010])).toEqual([0b0110]); });
});
