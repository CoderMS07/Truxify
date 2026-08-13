import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthStatus } from '../../src/core/health/HealthCheck.js';

vi.mock('../../src/config/db.js', () => ({
  pgPool: null,
}));

describe('kafkaHealth', () => {
  it('returns DEGRADED when KAFKA_BROKERS is not set', async () => {
    const original = process.env.KAFKA_BROKERS;
    const originalEnabled = process.env.KAFKA_ENABLED;
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_ENABLED;

    vi.resetModules();
    const { default: kafkaHealth } = await import('../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();

    process.env.KAFKA_BROKERS = original || '';
    process.env.KAFKA_ENABLED = originalEnabled || '';
    expect(result.status).toBe(HealthStatus.DEGRADED);
  });
});
