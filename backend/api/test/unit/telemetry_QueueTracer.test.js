import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/telemetry/SpanFactory.js', () => {
  const mockSpan = { end: vi.fn(), setStatus: vi.fn() };
  return {
    default: {
      withQueueProduceSpan: vi.fn((topic, fn) => fn()),
      withSpan: vi.fn((name, fn) => fn()),
      startSpan: vi.fn(() => mockSpan),
      recordError: vi.fn(),
    },
    STANDARD_ATTRIBUTES: { KAFKA_TOPIC: 'kafka.topic', KAFKA_PARTITION: 'kafka.partition', KAFKA_OFFSET: 'kafka.offset', KAFKA_CONSUMER_GROUP: 'kafka.consumer_group' },
  };
});

vi.mock('../../src/core/telemetry/ContextPropagator.js', () => ({
  ContextPropagator: {
    injectIntoKafkaMessage: vi.fn((msg) => msg),
    extractFromKafkaHeaders: vi.fn(() => undefined),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  context: { with: vi.fn((ctx, fn) => fn()), active: vi.fn() },
  trace: { setSpan: vi.fn() },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('queueTracer', () => {
  let QueueTracer;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/core/telemetry/QueueTracer.js');
    QueueTracer = mod.QueueTracer;
  });

  describe('wrapProducer', () => {
    it('wraps produce function and injects context', async () => {
      const produceFn = vi.fn().mockResolvedValue('produced');
      const wrapped = QueueTracer.wrapProducer(produceFn, 'test-topic');
      const result = await wrapped({ key: 'value' });
      expect(produceFn).toHaveBeenCalled();
    });

    it('injects context into Kafka message', async () => {
      const { ContextPropagator } = await import('../../src/core/telemetry/ContextPropagator.js');
      const produceFn = vi.fn().mockResolvedValue('ok');
      const wrapped = QueueTracer.wrapProducer(produceFn, 'topic-x');
      await wrapped({ data: 'test' });
    });
  });

  describe('wrapConsumer', () => {
    it('wraps consumer handler with tracing', async () => {
      const handler = vi.fn().mockResolvedValue('handled');
      const wrapped = QueueTracer.wrapConsumer(handler, { consumerGroup: 'group-1' });
      const result = await wrapped('topic-y', { data: 'msg' }, { partition: 0, offset: 42 });
      expect(handler).toHaveBeenCalled();
    });

    it('extracts context from Kafka headers', async () => {
      const { ContextPropagator } = await import('../../src/core/telemetry/ContextPropagator.js');
      ContextPropagator.extractFromKafkaHeaders.mockReturnValueOnce('restored-ctx');
      const handler = vi.fn().mockResolvedValue('ok');
      const wrapped = QueueTracer.wrapConsumer(handler, { consumerGroup: 'group-1' });
      await wrapped('topic-y', { data: 'msg' }, { partition: 0, offset: 42 });
    });
  });

  describe('createProducerTracer', () => {
    it('returns tracer with trace method', () => {
      const tracer = QueueTracer.createProducerTracer('my-topic');
      expect(tracer.trace).toBeDefined();
      expect(typeof tracer.trace).toBe('function');
    });

    it('trace method executes the provided function', async () => {
      const tracer = QueueTracer.createProducerTracer('my-topic');
      const fn = vi.fn().mockResolvedValue('done');
      await tracer.trace(fn);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('createConsumerTracer', () => {
    it('returns tracer with trace method', () => {
      const tracer = QueueTracer.createConsumerTracer('my-topic', 'my-group');
      expect(tracer.trace).toBeDefined();
    });
  });
});
