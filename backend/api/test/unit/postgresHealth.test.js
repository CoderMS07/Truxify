import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthStatus } from '../../src/core/health/HealthCheck.js';

describe('postgresHealth', () => {
  it('returns UNHEALTHY when pgPool is not configured', async () => {
    vi.resetModules();
    vi.mock('../../src/config/db.js', () => ({
      pgPool: null,
    }));
    const { default: postgresHealth } = await import('../../src/core/health/checks/postgresHealth.js');
    const result = await postgresHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
  });
});
