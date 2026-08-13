import { describe, it, expect } from 'vitest';
import { gfInverse } from '../../reed_solomon.js';
describe('inverse', () => {
  it('number', () => { expect(typeof gfInverse(2)).toBe('number'); });
});
