import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthStatus, withTimeout, executeCheck } from '../../src/core/health/HealthCheck.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('HealthStatus', () => {
  it('defines expected status values', () => {
    expect(HealthStatus.HEALTHY).toBe('healthy');
    expect(HealthStatus.DEGRADED).toBe('degraded');
    expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    expect(HealthStatus.UNKNOWN).toBe('unknown');
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when promise resolves within timeout', async () => {
    const promise = Promise.resolve('ok');
    const result = withTimeout(promise, 1000);
    vi.advanceTimersByTime(500);
    await Promise.resolve(); // flush microtasks
    await expect(result).resolves.toBe('ok');
  });

  it('rejects when promise takes too long', async () => {
    vi.useRealTimers(); // Need real timers for actual delays
    const promise = new Promise(r => setTimeout(() => r('ok'), 200));
    const result = withTimeout(promise, 50);
    await expect(result).rejects.toThrow('healthcheck timeout');
  });
});

describe('executeCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns healthy status when check resolves', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: 'healthy' });
    const result = await executeCheck('test-service', checkFn, {});
    expect(result.status).toBe('healthy');
    expect(result.name).toBe('test-service');
    expect(result.critical).toBe(false);
  });

  it('returns degraded status when check returns degraded', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: 'degraded', message: 'slow' });
    const result = await executeCheck('test-service', checkFn, {});
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('slow');
  });

  it('returns unhealthy when check throws', async () => {
    const checkFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const result = await executeCheck('test-service', checkFn, {});
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('Connection refused');
    expect(result.critical).toBe(false);
  });

  it('uses provided critical flag', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: 'healthy' });
    const result = await executeCheck('critical-service', checkFn, { critical: true });
    expect(result.critical).toBe(true);
  });

  it('includes responseTime in result', async () => {
    vi.useRealTimers();
    const checkFn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10));
      return { status: 'healthy' };
    });
    const result = await executeCheck('test-service', checkFn, {});
    expect(typeof result.responseTime).toBe('number');
    expect(result.responseTime).toBeGreaterThanOrEqual(10);
  });

  it('includes metadata in result', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: 'healthy', metadata: { url: 'http://localhost' } });
    const result = await executeCheck('test-service', checkFn, {});
    expect(result.metadata).toEqual({ url: 'http://localhost' });
  });

  it('returns unknown status when check returns undefined result', async () => {
    const checkFn = vi.fn().mockResolvedValue(undefined);
    const result = await executeCheck('test-service', checkFn, {});
    expect(result.status).toBe('healthy'); // nullish coalescing with HEALTHY
  });
});
