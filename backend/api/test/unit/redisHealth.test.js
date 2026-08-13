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

const { default: redisHealth } = await import('../../../src/core/health/checks/redisHealth.js');

describe('redisHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNHEALTHY when redisClient is not configured', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      redisClient: null,
    }));
    const { default: freshRedisHealth } = await import('../../../src/core/health/checks/redisHealth.js');
    const result = await freshRedisHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('not_configured');
  });

  it('returns HEALTHY when redisClient.ping() returns PONG', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      redisClient: {
        ping: vi.fn().mockResolvedValue('PONG'),
      },
    }));
    const { default: freshRedisHealth } = await import('../../../src/core/health/checks/redisHealth.js');
    const result = await freshRedisHealth();
    expect(result.status).toBe(HealthStatus.HEALTHY);
  });

  it('returns UNHEALTHY when redisClient.ping() returns unexpected reply', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      redisClient: {
        ping: vi.fn().mockResolvedValue('PANG'),
      },
    }));
    const { default: freshRedisHealth } = await import('../../../src/core/health/checks/redisHealth.js');
    const result = await freshRedisHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('unexpected reply: PANG');
  });

  it('returns UNHEALTHY when redisClient.ping() throws', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      redisClient: {
        ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      },
    }));
    const { default: freshRedisHealth } = await import('../../../src/core/health/checks/redisHealth.js');
    const result = await freshRedisHealth();
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
  });

  it('returns HEALTHY with no metadata when ping succeeds', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/db.js', () => ({
      redisClient: {
        ping: vi.fn().mockResolvedValue('PONG'),
      },
    }));
    const { default: freshRedisHealth } = await import('../../../src/core/health/checks/redisHealth.js');
    const result = await freshRedisHealth();
    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toBeUndefined();
  });
});
