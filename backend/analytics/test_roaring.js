import { describe, it, expect } from 'vitest';
import { bitmapNot } from '../../roaring_bitmap.js';
describe('not', () => {
  it('inv', () => { expect(bitmapNot([1, 3], 5)).toEqual([false, false, true, false, true]); });
});
