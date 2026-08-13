import { describe, it, expect } from 'vitest';
import { reconstructParallel } from '../../reed_solomon.js';
describe('parallel', () => {
  it('concat', async () => {
    expect((await reconstructParallel(['a','b'], (c) => Buffer.from(c))).toString()).toBe('ab');
  });
});
