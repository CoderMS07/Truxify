import { describe, it, expect, vi } from 'vitest';

describe('WorkerTracer', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/core/telemetry/WorkerTracer.js');
    expect(mod).toBeDefined();
  });
});
