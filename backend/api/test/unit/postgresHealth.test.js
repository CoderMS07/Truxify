import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('postgresHealth', () => {
  let postgresHealth;
  let mockPool;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      totalCount: 5,
      idleCount: 2,
    };
    // Override the pgPool import
    vi.doMock('../../src/config/db.js', () => ({
      pgPool: mockPool,
    }));
    postgresHealth = (await import('../../src/core/health/checks/postgresHealth.js')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns UNHEALTHY with not_configured when pgPool is absent', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/db.js', () => ({ pgPool: null }));
    postgresHealth = (await import('../../src/core/health/checks/postgresHealth.js')).default;
    const check = postgresHealth();
    const result = await check();
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('not_configured');
    expect(result.critical).toBe(true);
  });

  it('returns HEALTHY when query returns valid result', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ ok: 1 }] });
    const check = postgresHealth();
    const result = await check();
    expect(result.status).toBe('healthy');
    expect(result.metadata.poolTotalCount).toBe(5);
    expect(result.metadata.poolIdleCount).toBe(2);
  });

  it('returns UNHEALTHY when query returns empty rows', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const check = postgresHealth();
    const result = await check();
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('unexpected query result');
  });

  it('returns UNHEALTHY when query result has no ok field', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ different: 'value' }] });
    const check = postgresHealth();
    const result = await check();
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('unexpected query result');
  });

  it('returns UNHEALTHY when query throws', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection refused'));
    const check = postgresHealth();
    const result = await check();
    expect(result.status).toBe('unhealthy');
  });
});
