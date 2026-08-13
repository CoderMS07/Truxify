import { describe, it, expect, vi } from 'vitest';

describe('adminRoutes', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/routes/adminRoutes.js');
    expect(mod).toBeDefined();
  });
});
