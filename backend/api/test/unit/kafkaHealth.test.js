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

// Must import after mocks
const kafkaHealth = (await import('../../../src/core/health/checks/kafkaHealth.js')).default;

describe('kafkaHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_ENABLED;
  });

  it('returns DEGRADED when neither KAFKA_BROKERS nor KAFKA_ENABLED is set', async () => {
    const result = await kafkaHealth();
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('not_configured');
  });

  it('returns DEGRADED when KAFKA_BROKERS is empty and KAFKA_ENABLED is not set', async () => {
    process.env.KAFKA_BROKERS = '';
    const result = await kafkaHealth();
    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it('returns DEGRADED when kafkaConfig import fails', async () => {
    process.env.KAFKA_BROKERS = 'kafka:9092';
    vi.resetModules();
    vi.doMock('../../../../../kafka/config/kafka.config.js', () => {
      throw new Error('module not found');
    });
    const { default: kafkaHealthFresh } = await import('../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealthFresh();
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('module_not_available');
  });

  it('returns DEGRADED when kafka is not connected', async () => {
    process.env.KAFKA_BROKERS = 'kafka:9092';
    vi.resetModules();
    vi.doMock('../../../../../kafka/config/kafka.config.js', () => ({
      default: { isConnected: false },
    }));
    const { default: kafkaHealthFresh } = await import('../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealthFresh();
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toBe('producer_not_connected');
  });

  it('returns HEALTHY when kafka is connected', async () => {
    process.env.KAFKA_BROKERS = 'kafka:9092';
    vi.resetModules();
    vi.doMock('../../../../../kafka/config/kafka.config.js', () => ({
      default: { isConnected: true },
    }));
    const { default: kafkaHealthFresh } = await import('../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealthFresh();
    expect(result.status).toBe(HealthStatus.HEALTHY);
  });

  it('includes brokers metadata in healthy response', async () => {
    process.env.KAFKA_BROKERS = 'kafka-1:9092,kafka-2:9092';
    vi.resetModules();
    vi.doMock('../../../../../kafka/config/kafka.config.js', () => ({
      default: { isConnected: true },
    }));
    const { default: kafkaHealthFresh } = await import('../../../src/core/health/checks/kafkaHealth.js');
    const result = await kafkaHealthFresh();
    expect(result.metadata).toBeDefined();
    expect(result.metadata.brokers).toBe('kafka-1:9092,kafka-2:9092');
  });
});
