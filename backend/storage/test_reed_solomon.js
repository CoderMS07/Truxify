import { describe, it, expect } from 'vitest';
import { chunkBuffer, MAX_CHUNK } from '../../reed_solomon.js';
describe('chunk', () => {
  it('small', () => { expect(chunkBuffer(Buffer.from('x')).length).toBe(1); });
  it('large', () => { expect(chunkBuffer(Buffer.alloc(MAX_CHUNK + 1)).length).toBe(2); });
});
