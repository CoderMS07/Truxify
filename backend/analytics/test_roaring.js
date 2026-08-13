import { describe, it, expect } from 'vitest';
import { ArrayContainer, BitsetContainer } from '../../roaring_bitmap.js';
describe('upgrade', () => {
  it('upgrade', () => { const c = new ArrayContainer(); for (let i = 0; i < 4097; i++) c.add(i); expect(c.up()).toBeInstanceOf(BitsetContainer); });
});
