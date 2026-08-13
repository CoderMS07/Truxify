import { describe, it, expect, vi } from 'vitest';

describe('redisHealth', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/core/health/checks/redisHealth.js');
    expect(mod).toBeDefined();
  });
});
