import { describe, it, expect } from 'vitest';
import { RoaringBitmap } from '../../roaring_bitmap.js';
describe('clear', () => {
  it('clears', () => { const b = new RoaringBitmap(); b.add(1); b.clear(); expect(b.size).toBe(0); });
});
