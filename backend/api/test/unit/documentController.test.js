import { describe, it, expect, vi } from 'vitest';

describe('documentController', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/controllers/documentController.js');
    expect(mod).toBeDefined();
  });
});
