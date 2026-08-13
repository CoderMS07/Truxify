import { describe, it, expect } from 'vitest';
import { gaussianElimination } from '../../reed_solomon.js';
describe('gaussianElimination', () => {
  it('id', () => { gaussianElimination([[1, 0], [0, 1]]); });
  it('singular', () => { expect(() => gaussianElimination([[0,0],[0,0]])).toThrow(); });
});
