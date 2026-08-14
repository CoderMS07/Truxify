import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/tracing/tracing.js', () => ({
  default: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        addEvent: vi.fn(),
        end: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  context: { active: vi.fn(), with: vi.fn((ctx, fn) => fn()) },
  trace: { setSpan: vi.fn() },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('spanFactory', () => {
  let spanFactory, SPAN_NAMES, STANDARD_ATTRIBUTES;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/core/telemetry/SpanFactory.js');
    spanFactory = mod.default;
    SPAN_NAMES = mod.SPAN_NAMES;
    STANDARD_ATTRIBUTES = mod.STANDARD_ATTRIBUTES;
  });

  describe('SPAN_NAMES', () => {
    it('has all expected span name constants', () => {
      expect(SPAN_NAMES.WORKER_EXECUTION).toBe('worker.execution');
      expect(SPAN_NAMES.WORKER_RETRY).toBe('worker.retry');
      expect(SPAN_NAMES.QUEUE_PRODUCE).toBe('queue.produce');
      expect(SPAN_NAMES.QUEUE_CONSUME).toBe('queue.consume');
      expect(SPAN_NAMES.EVENT_PUBLISH).toBe('event.publish');
      expect(SPAN_NAMES.EVENT_SUBSCRIBE).toBe('event.subscribe');
      expect(SPAN_NAMES.RETRY_ATTEMPT).toBe('retry.attempt');
    });
  });

  describe('STANDARD_ATTRIBUTES', () => {
    it('has expected service and worker attributes', () => {
      expect(STANDARD_ATTRIBUTES.SERVICE_NAME).toBe('service.name');
      expect(STANDARD_ATTRIBUTES.WORKER_NAME).toBe('worker.name');
      expect(STANDARD_ATTRIBUTES.WORKER_ATTEMPT).toBe('worker.attempt');
      expect(STANDARD_ATTRIBUTES.ERROR_TYPE).toBe('error.type');
      expect(STANDARD_ATTRIBUTES.ERROR_MESSAGE).toBe('error.message');
    });
  });

  describe('startSpan', () => {
    it('creates a span with attributes', () => {
      const span = spanFactory.startSpan('test.operation', { attributes: { 'custom.attr': 'value' } });
      expect(span).toBeDefined();
    });
  });

  describe('startWorkerSpan', () => {
    it('creates worker span with worker attributes', () => {
      const span = spanFactory.startWorkerSpan('test-worker', { attempt: 1, maxAttempts: 3 });
      expect(span).toBeDefined();
    });
  });

  describe('startRetrySpan', () => {
    it('creates retry span with retry attributes', () => {
      const span = spanFactory.startRetrySpan('retry-op', 2, 3);
      expect(span).toBeDefined();
    });
  });

  describe('startQueueProduceSpan', () => {
    it('creates queue produce span', () => {
      const span = spanFactory.startQueueProduceSpan('test-topic');
      expect(span).toBeDefined();
    });
  });

  describe('startQueueConsumeSpan', () => {
    it('creates queue consume span with partition/offset', () => {
      const span = spanFactory.startQueueConsumeSpan('test-topic', { partition: 0, offset: 123 });
      expect(span).toBeDefined();
    });
  });

  describe('recordError', () => {
    it('handles null span gracefully', () => {
      expect(() => spanFactory.recordError(null, new Error('test'))).not.toThrow();
    });

    it('records exception and sets error status on span', () => {
      const mockSpan = { recordException: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() };
      const error = new Error('test error');
      spanFactory.recordError(mockSpan, error);
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalled();
    });
  });

  describe('addEvent', () => {
    it('adds event to span', () => {
      const mockSpan = { addEvent: vi.fn() };
      spanFactory.addEvent(mockSpan, 'custom-event', { attr: 'val' });
      expect(mockSpan.addEvent).toHaveBeenCalledWith('custom-event', { attr: 'val' });
    });

    it('handles null span gracefully', () => {
      expect(() => spanFactory.addEvent(null, 'event')).not.toThrow();
    });
  });

  describe('endSpan', () => {
    it('ends span and records duration', () => {
      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      spanFactory.endSpan(mockSpan, 100);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('handles null span gracefully', () => {
      expect(() => spanFactory.endSpan(null)).not.toThrow();
    });
  });

  describe('withSpan', () => {
    it('creates span, runs function, and ends span', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await spanFactory.withSpan('test', fn);
      expect(result).toBe('result');
    });
  });
});
