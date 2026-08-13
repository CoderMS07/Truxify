import { describe, it, expect } from 'vitest';
import { popcount } from '../../roaring_bitmap.js';
describe('popcount', () => {
  it('counts', () => { expect(popcount(0b1010)).toBe(2); });
  it('zero', () => { expect(popcount(0)).toBe(0); });
});
