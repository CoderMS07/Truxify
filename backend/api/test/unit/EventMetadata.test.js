import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  EventMetadata,
  EVENT_VERSIONS,
  EVENT_SOURCES,
  EVENT_CATEGORIES,
} from '../../src/core/events/EventMetadata.js';

describe('EventMetadata', () => {
  it('creates event with auto-generated UUID and defaults', () => {
    const meta = new EventMetadata({ eventType: 'order.created', source: 'order-service' });
    expect(meta.eventType).toBe('order.created');
    expect(meta.source).toBe('order-service');
    expect(meta.category).toBe(EVENT_CATEGORIES.DOMAIN);
    expect(meta.version).toBe(EVENT_VERSIONS.CURRENT);
    expect(meta.correlationId).toBeNull();
    expect(meta.causationId).toBeNull();
    expect(typeof meta.eventId).toBe('string');
    expect(meta.eventId.length).toBeGreaterThan(0);
    expect(typeof meta.timestamp).toBe('string');
  });

  it('uses provided eventId instead of generating one', () => {
    const meta = new EventMetadata({
      eventId: 'fixed-id-123',
      eventType: 'trip.started',
      source: 'trip-service',
    });
    expect(meta.eventId).toBe('fixed-id-123');
  });

  it('accepts optional correlationId and causationId', () => {
    const meta = new EventMetadata({
      eventType: 'payment.processed',
      source: 'payment-service',
      correlationId: 'corr-456',
      causationId: 'evt-789',
    });
    expect(meta.correlationId).toBe('corr-456');
    expect(meta.causationId).toBe('evt-789');
  });

  it('uses provided timestamp', () => {
    const ts = '2025-01-01T12:00:00.000Z';
    const meta = new EventMetadata({ eventType: 'order', source: 'order', timestamp: ts });
    expect(meta.timestamp).toBe(ts);
  });

  it('defaults source to INTERNAL when not provided', () => {
    const meta = new EventMetadata({ eventType: 'test' });
    expect(meta.source).toBe(EVENT_SOURCES.INTERNAL);
  });

  it('toJSON returns correct shape', () => {
    const meta = new EventMetadata({
      eventId: 'id-001',
      eventType: 'driver.assigned',
      source: 'dispatch-service',
      correlationId: 'corr-123',
      causationId: 'cause-456',
    });
    const json = meta.toJSON();
    expect(json).toEqual({
      eventId: 'id-001',
      eventType: 'driver.assigned',
      source: 'dispatch-service',
      category: 'domain',
      version: '1.0',
      correlationId: 'corr-123',
      causationId: 'cause-456',
      timestamp: meta.timestamp,
    });
  });

  it('fromJSON reconstructs EventMetadata from JSON', () => {
    const original = new EventMetadata({
      eventType: 'payment.captured',
      source: 'payment-service',
    });
    const json = original.toJSON();
    const reconstructed = EventMetadata.fromJSON(json);
    expect(reconstructed.eventType).toBe(original.eventType);
    expect(reconstructed.source).toBe(original.source);
    expect(reconstructed.eventId).toBe(original.eventId);
  });

  it('eventId is a valid UUID format', () => {
    const meta = new EventMetadata({ eventType: 'test', source: 'test' });
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(meta.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('EVENT_VERSIONS', () => {
  it('CURRENT is 1.0', () => {
    expect(EVENT_VERSIONS.CURRENT).toBe('1.0');
  });
});

describe('EVENT_SOURCES', () => {
  it('contains expected services', () => {
    expect(EVENT_SOURCES.ORDER_SERVICE).toBe('order-service');
    expect(EVENT_SOURCES.PAYMENT_SERVICE).toBe('payment-service');
    expect(EVENT_SOURCES.TRIP_SERVICE).toBe('trip-service');
    expect(EVENT_SOURCES.INTERNAL).toBe('internal');
  });

  it('sources are frozen', () => {
    expect(() => { EVENT_SOURCES.NEW_KEY = 'x'; }).toThrow();
  });
});

describe('EVENT_CATEGORIES', () => {
  it('contains expected categories', () => {
    expect(EVENT_CATEGORIES.DOMAIN).toBe('domain');
    expect(EVENT_CATEGORIES.INFRASTRUCTURE).toBe('infrastructure');
  });

  it('categories are frozen', () => {
    expect(() => { EVENT_CATEGORIES.NEW = 'x'; }).toThrow();
  });
});
