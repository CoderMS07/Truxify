import { describe, it, expect } from 'vitest';
import { decodeShardsWithRecovery } from '../../reed_solomon.js';
describe('recovery', () => {
  it('skip null', () => { expect(decodeShardsWithRecovery([Buffer.from('a'), null], 1).length).toBe(1); });
  it('fails', () => { expect(() => decodeShardsWithRecovery([null, null], 2)).toThrow(); });
});
