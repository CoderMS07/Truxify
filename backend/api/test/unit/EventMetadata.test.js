import { describe, it, expect } from 'vitest';
import {
  EventMetadata,
  EVENT_VERSIONS,
  EVENT_SOURCES,
  EVENT_CATEGORIES,
} from '../../src/core/events/EventMetadata.js';

describe('EventMetadata', () => {
  describe('constructor', () => {
    it('creates metadata with default timestamp and id', () => {
      const meta = new EventMetadata({ source: 'test-service' });
      expect(meta.source).toBe('test-service');
      expect(meta.timestamp).toBeDefined();
      expect(meta.eventId).toBeDefined();
    });

    it('accepts custom eventId and timestamp', () => {
      const meta = new EventMetadata({
        eventId: 'custom-id',
        timestamp: '2025-01-01T00:00:00.000Z',
        source: 'custom-source',
      });
      expect(meta.eventId).toBe('custom-id');
      expect(meta.timestamp).toBe('2025-01-01T00:00:00.000Z');
    });

    it('defaults source to INTERNAL', () => {
      const meta = new EventMetadata({});
      expect(meta.source).toBe(EVENT_SOURCES.INTERNAL);
    });

    it('defaults category to DOMAIN', () => {
      const meta = new EventMetadata({});
      expect(meta.category).toBe(EVENT_CATEGORIES.DOMAIN);
    });

    it('defaults version to CURRENT', () => {
      const meta = new EventMetadata({});
      expect(meta.version).toBe(EVENT_VERSIONS.CURRENT);
    });

    it('sets correlationId and causationId to null when not provided', () => {
      const meta = new EventMetadata({});
      expect(meta.correlationId).toBeNull();
      expect(meta.causationId).toBeNull();
    });

    it('accepts custom correlationId and causationId', () => {
      const meta = new EventMetadata({
        correlationId: 'corr-123',
        causationId: 'caus-456',
      });
      expect(meta.correlationId).toBe('corr-123');
      expect(meta.causationId).toBe('caus-456');
    });

    it('accepts eventType', () => {
      const meta = new EventMetadata({ eventType: 'ORDER_CREATED' });
      expect(meta.eventType).toBe('ORDER_CREATED');
    });
  });

  describe('toJSON', () => {
    it('returns all fields as JSON', () => {
      const meta = new EventMetadata({
        eventId: 'id-1',
        eventType: 'TEST_EVENT',
        source: 'test',
        category: EVENT_CATEGORIES.INFRASTRUCTURE,
        version: '1.0',
        correlationId: 'corr-1',
        causationId: 'caus-1',
        timestamp: '2025-01-01T00:00:00Z',
      });

      const json = meta.toJSON();
      expect(json.eventId).toBe('id-1');
      expect(json.eventType).toBe('TEST_EVENT');
      expect(json.source).toBe('test');
      expect(json.category).toBe(EVENT_CATEGORIES.INFRASTRUCTURE);
      expect(json.correlationId).toBe('corr-1');
      expect(json.causationId).toBe('caus-1');
    });
  });

  describe('fromJSON', () => {
    it('reconstructs EventMetadata from JSON', () => {
      const json = {
        eventId: 'restored-id',
        eventType: 'RESTORED_EVENT',
        source: 'restored-source',
        correlationId: 'restored-corr',
      };
      const meta = EventMetadata.fromJSON(json);
      expect(meta.eventId).toBe('restored-id');
      expect(meta.eventType).toBe('RESTORED_EVENT');
      expect(meta.correlationId).toBe('restored-corr');
    });
  });

  describe('EVENT_VERSIONS', () => {
    it('contains CURRENT version frozen at 1.0', () => {
      expect(EVENT_VERSIONS.CURRENT).toBe('1.0');
      expect(Object.isFrozen(EVENT_VERSIONS)).toBe(true);
    });
  });

  describe('EVENT_SOURCES', () => {
    it('contains expected service sources', () => {
      expect(EVENT_SOURCES.ORDER_SERVICE).toBe('order-service');
      expect(EVENT_SOURCES.PAYMENT_SERVICE).toBe('payment-service');
      expect(EVENT_SOURCES.TRIP_SERVICE).toBe('trip-service');
      expect(EVENT_SOURCES.INTERNAL).toBe('internal');
    });
  });

  describe('EVENT_CATEGORIES', () => {
    it('contains DOMAIN and INFRASTRUCTURE categories', () => {
      expect(EVENT_CATEGORIES.DOMAIN).toBe('domain');
      expect(EVENT_CATEGORIES.INFRASTRUCTURE).toBe('infrastructure');
    });
  });
});
