import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthStatus } from '../../../../../src/core/health/HealthCheck.js';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../../src/middleware/logger.js', () => ({
  default: mockLogger,
}));

const KAFKA_BROKERS_ORIG = process.env.KAFKA_BROKERS;
const KAFKA_ENABLED_ORIG = process.env.KAFKA_ENABLED;

function clearKafkaEnv() {
  delete process.env.KAFKA_BROKERS;
  delete process.env.KAFKA_ENABLED;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  clearKafkaEnv();
});

afterAll(() => {
  if (KAFKA_BROKERS_ORIG !== undefined) process.env.KAFKA_BROKERS = KAFKA_BROKERS_ORIG;
  if (KAFKA_ENABLED_ORIG !== undefined) process.env.KAFKA_ENABLED = KAFKA_ENABLED_ORIG;
});

describe('kafkaHealth', () => {
  it('reports DEGRADED when neither KAFKA_BROKERS nor KAFKA_ENABLED is set', async () => {
    const { default: kafkaHealth } = await import('../../../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('not_configured');
  });

  it('reports DEGRADED with module_not_available when only KAFKA_ENABLED is set but broker is unavailable', async () => {
    process.env.KAFKA_ENABLED = 'true';
    const { default: kafkaHealth } = await import('../../../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();
    // The dynamic import of kafka.config.js fails because the file does not exist
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('module_not_available');
  });

  it('reports DEGRADED when KAFKA_BROKERS is set but broker is unavailable', async () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    const { default: kafkaHealth } = await import('../../../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();
    expect(result.status).toBe(HealthStatus.DEGRADED);
    // The dynamic import fails since kafka.config.js does not exist in the workspace
    expect(['module_not_available', 'not_configured']).toContain(result.message);
  });

  it('returns a result with the correct structure', async () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    const { default: kafkaHealth } = await import('../../../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('timestamp');
  });

  it('reports DEGRADED regardless of environment when module cannot be loaded', async () => {
    process.env.KAFKA_BROKERS = 'kafka1:9092,kafka2:9092';
    const { default: kafkaHealth } = await import('../../../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealth();
    // Module load failure overrides the connected check
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('module_not_available');
  });
});
