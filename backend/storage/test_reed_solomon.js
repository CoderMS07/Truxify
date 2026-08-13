import { describe, it, expect } from 'vitest';
import { cauchyMatrix } from '../../reed_solomon.js';
describe('cauchy', () => {
  it('dim', () => { const m = cauchyMatrix(2, 2); expect(m.length).toBe(2); });
});
