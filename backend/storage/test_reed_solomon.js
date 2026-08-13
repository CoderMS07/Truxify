import { describe, it, expect } from 'vitest';
import { shardChecksum, verifyShard } from '../../reed_solomon.js';
describe('checksum', () => {
  it('det', () => { expect(shardChecksum(Buffer.from('x'))).toBe(shardChecksum(Buffer.from('x'))); });
  it('verify', () => { const b = Buffer.from('y'); expect(verifyShard(b, shardChecksum(b))).toBe(true); });
});
