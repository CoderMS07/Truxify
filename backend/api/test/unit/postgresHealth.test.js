import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/middleware/logger.js', () => ({
  default: mockLogger,
}));

const HealthStatus = { HEALTHY: 'healthy', DEGRADED: 'degraded', UNHEALTHY: 'unhealthy' };
vi.mock('../../../src/core/health/HealthCheck.js', () => ({
  HealthStatus,
  executeCheck: vi.fn((name, fn, opts) => fn()),
  withTimeout: vi.fn((promise) => promise),
}));

const { default: postgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');

describe('postgresHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNHEALTHY when pgPool is not configured', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      pgPool: null,
    }));
    const { default: freshPostgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');
    const result = await freshPostgresHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('not_configured');
  });

  it('returns HEALTHY when pgPool.query returns valid result', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      pgPool: {
        query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
        totalCount: 10,
        idleCount: 2,
      },
    }));
    const { default: freshPostgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');
    const result = await freshPostgresHealth();
    expect(result.status).toBe(HealthStatus.HEALTHY);
  });

  it('returns HEALTHY and includes pool metadata when healthy', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      pgPool: {
        query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
        totalCount: 10,
        idleCount: 3,
      },
    }));
    const { default: freshPostgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');
    const result = await freshPostgresHealth();
    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.poolTotalCount).toBe(10);
    expect(result.metadata.poolIdleCount).toBe(3);
  });

  it('returns UNHEALTHY when pgPool.query returns unexpected result', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      pgPool: {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      },
    }));
    const { default: freshPostgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');
    const result = await freshPostgresHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('unexpected query result');
  });

  it('returns UNHEALTHY when pgPool.query throws', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      pgPool: {
        query: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    }));
    const { default: freshPostgresHealth } = await import('../../../src/core/health/checks/postgresHealth.js');
    const result = await freshPostgresHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('connection refused');
  });
});
