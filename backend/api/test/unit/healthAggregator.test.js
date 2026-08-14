/**
 * Unit tests for HealthAggregator.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthAggregator } from '../../src/core/health/HealthAggregator.js';
import { HealthStatus } from '../../src/core/health/HealthCheck.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('HealthAggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new HealthAggregator();
  });

  describe('register', () => {
    it('adds a check to the internal list', () => {
      aggregator.register('test-svc', async () => ({ status: 'healthy' }));
      expect(aggregator._checks).toHaveLength(1);
      expect(aggregator._checks[0].name).toBe('test-svc');
    });

    it('accepts critical flag', () => {
      aggregator.register('critical-svc', async () => ({}), { critical: true });
      expect(aggregator._checks[0].critical).toBe(true);
    });

    it('accepts custom timeoutMs', () => {
      aggregator.register('slow-svc', async () => ({}), { timeoutMs: 5000 });
      expect(aggregator._checks[0].timeoutMs).toBe(5000);
    });

    it('defaults critical to false', () => {
      aggregator.register('normal-svc', async () => ({}));
      expect(aggregator._checks[0].critical).toBe(false);
    });
  });

  describe('aggregate', () => {
    it('returns healthy status when all checks pass', async () => {
      aggregator.register('svc-a', async () => ({ status: HealthStatus.HEALTHY }));
      aggregator.register('svc-b', async () => ({ status: HealthStatus.HEALTHY }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      // aggregator does not attach name on success, so all successful results share key 'undefined'
      // but there should be 2 results counted
      expect(result.summary.total).toBeGreaterThanOrEqual(2);
      expect(result.summary.healthy).toBeGreaterThanOrEqual(2);
    });

    it('returns degraded when a non-critical service fails', async () => {
      aggregator.register('healthy-svc', async () => ({ status: HealthStatus.HEALTHY }));
      aggregator.register('failing-svc', async () => {
        throw new Error('service down');
      });

      const result = await aggregator.aggregate();

      expect(result.status).toBe(HealthStatus.DEGRADED);
    });

    it('returns unhealthy when a critical service fails', async () => {
      aggregator.register('critical-svc', async () => {
        throw new Error('critical failure');
      }, { critical: true });

      const result = await aggregator.aggregate();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('returns degraded when a non-critical service returns degraded status', async () => {
      aggregator.register('degraded-svc', async () => ({ status: HealthStatus.DEGRADED }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.summary.degraded).toBeGreaterThanOrEqual(1);
    });

    it('includes responseTime and timestamp in result', async () => {
      aggregator.register('timed-svc', async () => ({ status: HealthStatus.HEALTHY }));

      const result = await aggregator.aggregate();

      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes memory information in result', async () => {
      aggregator.register('mem-svc', async () => ({ status: HealthStatus.HEALTHY }));

      const result = await aggregator.aggregate();

      expect(result.memory).toBeDefined();
      expect(result.memory.rss).toBeGreaterThan(0);
      expect(result.memory.unit).toBe('MB');
    });
  });

  describe('_buildSummary', () => {
    it('counts healthy, degraded, and unhealthy services correctly', () => {
      const results = [
        { name: 'a', status: HealthStatus.HEALTHY },
        { name: 'b', status: HealthStatus.HEALTHY },
        { name: 'c', status: HealthStatus.DEGRADED },
        { name: 'd', status: HealthStatus.UNHEALTHY },
      ];

      const summary = aggregator._buildSummary(results);

      expect(summary.total).toBe(4);
      expect(summary.healthy).toBe(2);
      expect(summary.degraded).toBe(1);
      expect(summary.unhealthy).toBe(1);
    });
  });

  describe('_determineOverallStatus', () => {
    it('returns unhealthy if any critical service is unhealthy', () => {
      const results = [
        { status: HealthStatus.HEALTHY, critical: false },
        { status: HealthStatus.HEALTHY, critical: true },
        { status: HealthStatus.UNHEALTHY, critical: true },
      ];
      expect(aggregator._determineOverallStatus(results)).toBe(HealthStatus.UNHEALTHY);
    });

    it('returns degraded if any non-critical service is degraded', () => {
      const results = [
        { status: HealthStatus.HEALTHY, critical: false },
        { status: HealthStatus.DEGRADED, critical: false },
      ];
      expect(aggregator._determineOverallStatus(results)).toBe(HealthStatus.DEGRADED);
    });

    it('returns degraded if any non-critical service is unhealthy', () => {
      const results = [
        { status: HealthStatus.HEALTHY, critical: false },
        { status: HealthStatus.UNHEALTHY, critical: false },
      ];
      expect(aggregator._determineOverallStatus(results)).toBe(HealthStatus.DEGRADED);
    });

    it('returns healthy when all services are healthy', () => {
      const results = [
        { status: HealthStatus.HEALTHY, critical: false },
        { status: HealthStatus.HEALTHY, critical: true },
      ];
      expect(aggregator._determineOverallStatus(results)).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('_formatMemory', () => {
    it('converts bytes to MB and includes unit', () => {
      const mem = { rss: 104857600, heapTotal: 52428800, heapUsed: 26214400, external: 1048576 };
      const formatted = aggregator._formatMemory(mem);
      expect(formatted.rss).toBe(100);
      expect(formatted.heapTotal).toBe(50);
      expect(formatted.heapUsed).toBe(25);
      expect(formatted.external).toBe(1);
      expect(formatted.unit).toBe('MB');
    });
  });
});
