/**
 * Unit tests for HealthCheck.js
 *
 * Tests the withTimeout utility and executeCheck function for health monitoring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTimeout, executeCheck, HealthStatus } from '../../src/core/health/HealthCheck.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('withTimeout', () => {
  it('resolves when promise resolves within timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects when promise times out', async () => {
    vi.useFakeTimers();
    const promise = new Promise(() => {}); // never resolves
    const p = withTimeout(promise, 100);
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    await expect(p).rejects.toThrow('healthcheck timeout after 100ms');
  });

  it('uses default timeout when not specified', async () => {
    vi.useFakeTimers();
    const promise = new Promise(() => {}); // never resolves
    const p = withTimeout(promise); // default 400ms
    vi.advanceTimersByTime(450);
    vi.useRealTimers();
    await expect(p).rejects.toThrow('healthcheck timeout after 400ms');
  });

  it('clears timer when promise resolves quickly', async () => {
    vi.useFakeTimers();
    const promise = new Promise((resolve) => setTimeout(resolve, 50));
    const p = withTimeout(promise, 1000);
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    // Just verify it resolves without error
    await expect(p).resolves.toBeUndefined();
  });
});

describe('executeCheck', () => {
  it('returns healthy status for successful check', async () => {
    const result = await executeCheck('test-service', async () => ({ status: 'healthy' }));
    expect(result.name).toBe('test-service');
    expect(result.status).toBe('healthy');
    expect(result.critical).toBe(false);
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
  });

  it('returns default healthy when check resolves without status', async () => {
    const result = await executeCheck('no-status-service', async () => ({}));
    expect(result.status).toBe(HealthStatus.HEALTHY);
  });

  it('returns unhealthy status when check throws', async () => {
    const result = await executeCheck('failing-service', async () => {
      throw new Error('connection refused');
    });
    expect(result.name).toBe('failing-service');
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('connection refused');
    expect(result.critical).toBe(false);
  });

  it('respects critical flag in result', async () => {
    const result = await executeCheck('critical-db', async () => ({ status: 'healthy' }), { critical: true });
    expect(result.critical).toBe(true);
  });

  it('returns unhealthy when check function throws', async () => {
    const result = await executeCheck('throwing-check', async () => {
      throw new Error('service unavailable');
    });
    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toBe('service unavailable');
  });
});

describe('HealthStatus constants', () => {
  it('contains all expected status values', () => {
    expect(HealthStatus.HEALTHY).toBe('healthy');
    expect(HealthStatus.DEGRADED).toBe('degraded');
    expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    expect(HealthStatus.UNKNOWN).toBe('unknown');
  });
});
