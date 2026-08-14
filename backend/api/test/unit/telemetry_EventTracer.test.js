import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/telemetry/SpanFactory.js', () => {
  const mockSpan = { end: vi.fn(), setStatus: vi.fn() };
  return {
    default: {
      startEventPublishSpan: vi.fn(() => mockSpan),
      withSpan: vi.fn((name, fn) => fn()),
      recordError: vi.fn(),
    },
    STANDARD_ATTRIBUTES: { EVENT_TYPE: 'event.type' },
  };
});

vi.mock('../../src/core/telemetry/ContextPropagator.js', () => ({
  ContextPropagator: {
    injectIntoEventPayload: vi.fn((e) => e),
    extractFromEventPayload: vi.fn(() => undefined),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  context: { with: vi.fn((ctx, fn) => fn()), active: vi.fn() },
  trace: { setSpan: vi.fn() },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('eventTracer', () => {
  let EventTracer;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/core/telemetry/EventTracer.js');
    EventTracer = mod.EventTracer;
  });

  describe('wrapPublish', () => {
    it('calls original publish function with enriched event', () => {
      const mockPublish = vi.fn().mockReturnValue('published');
      const eventBus = {};
      const wrapped = EventTracer.wrapPublish(mockPublish, eventBus);
      const result = wrapped('ORDER_CREATED', { data: 'test' });
      expect(mockPublish).toHaveBeenCalled();
    });

    it('skips tracing when eventType is missing', () => {
      const mockPublish = vi.fn().mockReturnValue('published');
      const eventBus = {};
      const wrapped = EventTracer.wrapPublish(mockPublish, eventBus);
      // When no eventType is provided, original publish is called as-is
      const result = wrapped(null, {});
      expect(mockPublish).toHaveBeenCalled();
    });

    it('handles event object with metadata', () => {
      const mockPublish = vi.fn().mockReturnValue('published');
      const eventBus = {};
      const wrapped = EventTracer.wrapPublish(mockPublish, eventBus);
      const event = { metadata: { eventType: 'ORDER_PLACED', source: 'order-service' } };
      wrapped(event);
      expect(mockPublish).toHaveBeenCalled();
    });
  });

  describe('wrapSubscribe', () => {
    it('wraps subscribe handler with tracing', () => {
      const handler = vi.fn().mockResolvedValue('handled');
      const wrapped = EventTracer.wrapSubscribe('ORDER_PLACED', handler);
      const event = { metadata: { eventType: 'ORDER_PLACED' } };
      wrapped(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('extracts trace context from event metadata', async () => {
      const { ContextPropagator } = await import('../../src/core/telemetry/ContextPropagator.js');
      ContextPropagator.extractFromEventPayload.mockReturnValueOnce('restored-ctx');
      const handler = vi.fn().mockResolvedValue('ok');
      const wrapped = EventTracer.wrapSubscribe('TEST_EVENT', handler);
      await wrapped({ metadata: { eventType: 'TEST_EVENT', traceContext: 'ctx' } });
    });
  });

  describe('wrapEventHandler', () => {
    it('wraps event handler function', async () => {
      const handlerFn = vi.fn().mockResolvedValue('result');
      const wrapped = EventTracer.wrapEventHandler('myHandler', handlerFn);
      const event = { metadata: { eventType: 'TEST' } };
      await wrapped(event);
      expect(handlerFn).toHaveBeenCalledWith(event);
    });
  });

  describe('traceEventBus', () => {
    it('patches publish and on methods', () => {
      const originalPublish = vi.fn();
      const originalOn = vi.fn();
      const eventBus = { publish: originalPublish, on: originalOn };
      const traced = EventTracer.traceEventBus(eventBus);
      expect(traced.publish).not.toBe(originalPublish);
      expect(traced.on).not.toBe(originalOn);
    });

    it('calls the original publish when traced publish is invoked', () => {
      const originalPublish = vi.fn();
      const eventBus = { publish: originalPublish, on: vi.fn() };
      EventTracer.traceEventBus(eventBus);
      eventBus.publish('TEST_EVENT', {});
      expect(originalPublish).toHaveBeenCalled();
    });
  });
});
