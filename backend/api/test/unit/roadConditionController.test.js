import { describe, it, expect, vi } from 'vitest';

describe('roadConditionController', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/controllers/roadConditionController.js');
    expect(mod).toBeDefined();
  });
});
