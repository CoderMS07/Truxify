import { describe, it, expect } from 'vitest';
import { sortedAnd } from '../../roaring_bitmap.js';
describe('sortedAnd', () => {
  it('intersect', () => { expect(sortedAnd([1,3,5], [3,5,7])).toEqual([3,5]); });
});
