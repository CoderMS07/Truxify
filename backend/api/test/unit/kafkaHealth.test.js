import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('kafkaHealth', () => {
  let kafkaHealth;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: Kafka not configured
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_ENABLED;
    kafkaHealth = (await import('../../src/core/health/checks/kafkaHealth.js')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns DEGRADED with not_configured when env vars are absent', async () => {
    const check = kafkaHealth();
    const result = await check();
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('not_configured');
    expect(result.critical).toBe(false);
  });

  it('returns DEGRADED when only KAFKA_ENABLED is set without brokers', async () => {
    process.env.KAFKA_ENABLED = 'true';
    vi.resetModules();
    delete process.env.KAFKA_BROKERS;
    kafkaHealth = (await import('../../src/core/health/checks/kafkaHealth.js')).default;
    const check = kafkaHealth();
    const result = await check();
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('not_configured');
  });

  it('returns DEGRADED when kafka config isConnected is false', async () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    vi.resetModules();
    // Mock the kafka.config module
    vi.doMock('../../../kafka/config/kafka.config.js', () => ({
      default: { isConnected: false },
    }));
    kafkaHealth = (await import('../../src/core/health/checks/kafkaHealth.js')).default;
    const check = kafkaHealth();
    const result = await check();
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('producer_not_connected');
  });

  it('returns HEALTHY when kafka config isConnected is true', async () => {
    process.env.KAFKA_BROKERS = 'kafka1:9092,kafka2:9092';
    vi.resetModules();
    vi.doMock('../../../kafka/config/kafka.config.js', () => ({
      default: { isConnected: true },
    }));
    kafkaHealth = (await import('../../src/core/health/checks/kafkaHealth.js')).default;
    const check = kafkaHealth();
    const result = await check();
    expect(result.status).toBe('healthy');
    expect(result.metadata.brokers).toBe('kafka1:9092,kafka2:9092');
  });

  it('returns DEGRADED with module_not_available when import fails', async () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    vi.resetModules();
    vi.doMock('../../../kafka/config/kafka.config.js', () => {
      throw new Error('Module not found');
    });
    kafkaHealth = (await import('../../src/core/health/checks/kafkaHealth.js')).default;
    const check = kafkaHealth();
    const result = await check();
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('module_not_available');
  });
});
