import { describe, it, expect } from 'vitest';
import { toRle } from '../../roaring_bitmap.js';
describe('toRle', () => {
  it('runs', () => { expect(toRle([1,1,0,1])).toEqual([[0,1],[3,3]]); });
  it('empty', () => { expect(toRle([])).toEqual([]); });
});
