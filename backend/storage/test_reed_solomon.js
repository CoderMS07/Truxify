import { describe, it, expect } from 'vitest';
import { validateShards } from '../../reed_solomon.js';
describe('shards', () => {
  it('valid', () => { expect(validateShards(4, 2)).toEqual({ d: 4, p: 2 }); });
  it('bad', () => { expect(() => validateShards(0, 2)).toThrow(); });
});
