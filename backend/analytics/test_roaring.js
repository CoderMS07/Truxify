import { describe, it, expect } from 'vitest';
import { serializeRoaring } from '../../roaring_bitmap.js';
describe('serialize', () => {
  it('magic', () => { expect(serializeRoaring([1]).readUInt16LE(0)).toBe(0x1234); });
});
