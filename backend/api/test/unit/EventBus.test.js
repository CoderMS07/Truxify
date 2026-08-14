import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenTelemetry
vi.mock('@opentelemetry/api', () => ({
  context: { active: vi.fn(() => ({})), with: vi.fn((ctx, fn) => fn()) },
  trace: { getSpan: vi.fn(() => null), setSpan: vi.fn() },
  SpanStatusCode: { OK: 0, ERROR: 2 },
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('EventBus', () => {
  let EventBus, eventBus;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../../src/core/events/EventBus.js');
    EventBus = mod.EventBus;
    eventBus = new EventBus();
  });

  describe('constructor', () => {
    it('sets max listeners to 50', () => {
      expect(eventBus.getMaxListeners()).toBe(50);
    });

    it('initializes empty _adapters, _registry, _deduplication maps', () => {
      expect(eventBus._adapters.size).toBe(0);
      expect(eventBus._deduplication.size).toBe(0);
    });

    it('initializes zero metrics', () => {
      const metrics = eventBus.metrics;
      expect(metrics.published).toBe(0);
      expect(metrics.subscribed).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.deduplicated).toBe(0);
    });
  });

  describe('registerAdapter', () => {
    it('registers an adapter by name', () => {
      const adapter = { connect: vi.fn() };
      const result = eventBus.registerAdapter('kafka', adapter);
      expect(eventBus._adapters.has('kafka')).toBe(true);
      expect(result).toBe(eventBus); // fluent
    });
  });

  describe('removeAdapter', () => {
    it('removes a registered adapter', () => {
      const adapter = { disconnect: vi.fn() };
      eventBus.registerAdapter('kafka', adapter);
      eventBus.removeAdapter('kafka');
      expect(eventBus._adapters.has('kafka')).toBe(false);
    });
  });

  describe('connectAdapters', () => {
    it('calls connect on each adapter', async () => {
      const adapter1 = { connect: vi.fn().mockResolvedValue(undefined) };
      const adapter2 = { connect: vi.fn().mockResolvedValue(undefined) };
      eventBus.registerAdapter('a1', adapter1);
      eventBus.registerAdapter('a2', adapter2);
      await eventBus.connectAdapters();
      expect(adapter1.connect).toHaveBeenCalled();
      expect(adapter2.connect).toHaveBeenCalled();
    });

    it('handles adapter connect failure gracefully', async () => {
      const badAdapter = {
        connect: vi.fn().mockRejectedValue(new Error('connect failed')),
      };
      eventBus.registerAdapter('bad', badAdapter);
      // Should not throw
      await expect(eventBus.connectAdapters()).resolves.toBeUndefined();
    });
  });

  describe('publish', () => {
    it('increments published metric', async () => {
      eventBus.on('test.event', () => {});
      await eventBus.publish({ eventType: 'test.event', payload: {} });
      expect(eventBus.metrics.published).toBe(1);
    });

    it('emits event to registered listeners', async () => {
      const handler = vi.fn();
      eventBus.on('order.created', handler);
      await eventBus.publish({ eventType: 'order.created', payload: { id: '123' } });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('handles listener throwing without crashing publish', async () => {
      eventBus.on('order.created', () => { throw new Error('handler error'); });
      // Should not throw
      await expect(eventBus.publish({ eventType: 'order.created', payload: {} })).resolves.toBeUndefined();
    });
  });

  describe('subscribe', () => {
    it('increments subscribed metric', async () => {
      await eventBus.subscribe('test.event', vi.fn());
      expect(eventBus.metrics.subscribed).toBe(1);
    });
  });

  describe('registry', () => {
    it('exposes registry via getter', () => {
      expect(eventBus.registry).toBeDefined();
    });
  });
});
