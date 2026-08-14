import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KafkaAdapter } from '../../src/core/events/adapters/KafkaAdapter.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('KafkaAdapter', () => {
  let adapter;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      publishEvent: vi.fn().mockResolvedValue(undefined),
      publishBatch: vi.fn().mockResolvedValue(undefined),
    };
    adapter = new KafkaAdapter(mockConfig);
  });

  describe('constructor', () => {
    it('initializes _connected to false', () => {
      expect(adapter.isConnected).toBe(false);
    });

    it('initializes empty _topicMap', () => {
      expect(adapter._topicMap.size).toBe(0);
    });
  });

  describe('setTopicMap', () => {
    it('sets topic mappings', () => {
      const result = adapter.setTopicMap({ 'order.created': 'truxify-orders' });
      expect(adapter._topicMap.get('order.created')).toBe('truxify-orders');
      expect(result).toBe(adapter); // fluent
    });
  });

  describe('getTopic', () => {
    it('returns mapped topic when set', () => {
      adapter.setTopicMap({ 'order.created': 'truxify-orders' });
      expect(adapter.getTopic('order.created')).toBe('truxify-orders');
    });

    it('returns dot-to-underscore conversion when not mapped', () => {
      expect(adapter.getTopic('order.shipped')).toBe('order_shipped');
    });

    it('returns original when no conversion needed', () => {
      expect(adapter.getTopic('simple_event')).toBe('simple_event');
    });

    it('replaces all dots with underscores', () => {
      expect(adapter.getTopic('a.b.c')).toBe('a_b_c');
    });
  });

  describe('connect', () => {
    it('sets connected to true on success', async () => {
      await adapter.connect();
      expect(adapter.isConnected).toBe(true);
    });

    it('is idempotent when already connected', async () => {
      await adapter.connect();
      await adapter.connect(); // should not throw
      expect(adapter.isConnected).toBe(true);
    });

    it('throws when config.connect fails', async () => {
      mockConfig.connect.mockRejectedValue(new Error('Kafka unavailable'));
      await expect(adapter.connect()).rejects.toThrow('Kafka unavailable');
    });
  });

  describe('disconnect', () => {
    it('sets connected to false on success', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });

    it('handles disconnect failure gracefully', async () => {
      mockConfig.disconnect.mockRejectedValue(new Error('Disconnect error'));
      await adapter.connect();
      await adapter.disconnect(); // should not throw
      expect(adapter.isConnected).toBe(false);
    });
  });
});
