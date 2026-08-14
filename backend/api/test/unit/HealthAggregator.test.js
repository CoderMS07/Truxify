import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthAggregator } from '../../src/core/health/HealthAggregator.js';
import { HealthStatus } from '../../src/core/health/HealthCheck.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('HealthAggregator', () => {
  let aggregator;

  beforeEach(() => {
    vi.clearAllMocks();
    aggregator = new HealthAggregator();
  });

  describe('constructor', () => {
    it('creates aggregator with empty checks array', () => {
      expect(aggregator._checks).toEqual([]);
    });
  });

  describe('register', () => {
    it('registers a check', () => {
      aggregator.register('test-service', vi.fn().mockResolvedValue({ status: 'healthy' }));
      expect(aggregator._checks).toHaveLength(1);
    });

    it('registers with default critical=false', () => {
      aggregator.register('test', vi.fn());
      expect(aggregator._checks[0].critical).toBe(false);
    });

    it('registers with provided critical flag', () => {
      aggregator.register('test', vi.fn(), { critical: true });
      expect(aggregator._checks[0].critical).toBe(true);
    });

    it('registers with custom timeout', () => {
      aggregator.register('test', vi.fn(), { timeoutMs: 1000 });
      expect(aggregator._checks[0].timeoutMs).toBe(1000);
    });
  });

  describe('aggregate', () => {
    it('returns healthy when all checks pass', async () => {
      aggregator.register('service-a', vi.fn().mockResolvedValue({ status: 'healthy' }));
      aggregator.register('service-b', vi.fn().mockResolvedValue({ status: 'healthy' }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('healthy');
      expect(result.services['service-a'].status).toBe('healthy');
      expect(result.services['service-b'].status).toBe('healthy');
      expect(result.summary.total).toBe(2);
      expect(result.summary.healthy).toBe(2);
    });

    it('returns degraded when a non-critical service fails', async () => {
      aggregator.register('healthy-service', vi.fn().mockResolvedValue({ status: 'healthy' }));
      aggregator.register('unhealthy-service', vi.fn().mockRejectedValue(new Error('down')));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('degraded');
      expect(result.summary.healthy).toBe(1);
      expect(result.summary.unhealthy).toBe(1);
    });

    it('returns unhealthy when a critical service fails', async () => {
      aggregator.register('critical-service', vi.fn().mockRejectedValue(new Error('down')), { critical: true });
      aggregator.register('non-critical', vi.fn().mockResolvedValue({ status: 'healthy' }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('unhealthy');
    });

    it('returns unhealthy when multiple critical services fail', async () => {
      aggregator.register('critical-a', vi.fn().mockRejectedValue(new Error('down')), { critical: true });
      aggregator.register('critical-b', vi.fn().mockRejectedValue(new Error('down')), { critical: true });

      const result = await aggregator.aggregate();

      expect(result.status).toBe('unhealthy');
      expect(result.summary.unhealthy).toBe(2);
    });

    it('returns degraded when service is degraded', async () => {
      aggregator.register('degraded-service', vi.fn().mockResolvedValue({ status: 'degraded', message: 'slow' }));
      aggregator.register('healthy', vi.fn().mockResolvedValue({ status: 'healthy' }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('degraded');
      expect(result.summary.degraded).toBe(1);
    });

    it('includes uptime, version, memory in result', async () => {
      aggregator.register('test', vi.fn().mockResolvedValue({ status: 'healthy' }));

      const result = await aggregator.aggregate();

      expect(typeof result.uptime).toBe('number');
      expect(result.version).toBeDefined();
      expect(result.memory).toBeDefined();
    });

    it('handles check that returns degraded status', async () => {
      aggregator.register('degraded', vi.fn().mockResolvedValue({ status: 'degraded' }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('degraded');
      expect(result.services['degraded'].status).toBe('degraded');
    });

    it('handles check that returns unknown status', async () => {
      aggregator.register('unknown', vi.fn().mockResolvedValue({ status: 'unknown' }));

      const result = await aggregator.aggregate();

      expect(result.status).toBe('degraded'); // unknown counts as degraded
      expect(result.services['unknown'].status).toBe('unknown');
    });
  });
});
