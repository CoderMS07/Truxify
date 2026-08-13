import { describe, it, expect } from 'vitest';
import { gfMod } from '../../reed_solomon.js';
describe('gfMod', () => {
  it('wraps', () => { expect(gfMod(256)).toBe(1); });
  it('negative', () => { expect(gfMod(-1)).toBe(254); });
});
