import { describe, it, expect } from 'vitest';
import {
  ORDER_READ_MODEL_TABLE,
  ORDER_READ_MODEL_COLUMNS,
  ORDER_READ_MODEL_PRIMARY_KEY,
  OrderReadModelSchemaError,
  assertOrderReadModelRow,
  deriveOrderStatus,
  deriveEventTypeFromTimeline,
} from '../../../../src/core/orders/read-model-schema.js';

describe('read-model-schema', () => {
  describe('constants', () => {
    it('exports ORDER_READ_MODEL_TABLE', () => {
      expect(ORDER_READ_MODEL_TABLE).toBe('orders_read_model');
    });

    it('exports ORDER_READ_MODEL_PRIMARY_KEY', () => {
      expect(ORDER_READ_MODEL_PRIMARY_KEY).toBe('order_id');
    });

    it('exports ORDER_READ_MODEL_COLUMNS as a frozen array', () => {
      expect(Array.isArray(ORDER_READ_MODEL_COLUMNS)).toBe(true);
      expect(Object.isFrozen(ORDER_READ_MODEL_COLUMNS)).toBe(true);
      expect(ORDER_READ_MODEL_COLUMNS).toContain('order_id');
      expect(ORDER_READ_MODEL_COLUMNS).toContain('payload');
      expect(ORDER_READ_MODEL_COLUMNS).toContain('status');
      expect(ORDER_READ_MODEL_COLUMNS).toContain('timeline');
    });
  });

  describe('OrderReadModelSchemaError', () => {
    it('has the correct name and code', () => {
      const err = new OrderReadModelSchemaError('test message');
      expect(err.name).toBe('OrderReadModelSchemaError');
      expect(err.code).toBe('ORDER_READ_MODEL_SCHEMA_DRIFT');
      expect(err.message).toBe('test message');
    });

    it('is an instance of Error', () => {
      const err = new OrderReadModelSchemaError('test');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('assertOrderReadModelRow', () => {
    it('throws when row is null', () => {
      expect(() => assertOrderReadModelRow(null)).toThrow(OrderReadModelSchemaError);
    });

    it('throws when row is undefined', () => {
      expect(() => assertOrderReadModelRow(undefined)).toThrow(OrderReadModelSchemaError);
    });

    it('throws when row is not an object', () => {
      expect(() => assertOrderReadModelRow('string')).toThrow(OrderReadModelSchemaError);
      expect(() => assertOrderReadModelRow(42)).toThrow(OrderReadModelSchemaError);
    });

    it('throws when row is an array', () => {
      expect(() => assertOrderReadModelRow([])).toThrow(OrderReadModelSchemaError);
    });

    it('throws when row contains unknown columns', () => {
      const row = { order_id: 'abc', payload: {}, unknown_column: 'bad' };
      expect(() => assertOrderReadModelRow(row)).toThrow(OrderReadModelSchemaError);
      expect(() => assertOrderReadModelRow(row)).toThrow(/unknown_column/);
    });

    it('throws when row is missing order_id', () => {
      const row = { payload: {}, event_type: 'ORDER_CREATED', version: 1, status: 'created', timeline: [], updated_at: new Date().toISOString() };
      expect(() => assertOrderReadModelRow(row)).toThrow(/order_id/);
    });

    it('returns the row when valid', () => {
      const row = {
        order_id: 'abc123',
        payload: { foo: 'bar' },
        event_type: 'ORDER_CREATED',
        version: 1,
        status: 'created',
        timeline: [],
        updated_at: new Date().toISOString(),
      };
      expect(assertOrderReadModelRow(row)).toBe(row);
    });

    it('accepts a row with all canonical columns', () => {
      const row = {
        order_id: 'order-1',
        payload: { customer: 'acme' },
        event_type: 'ORDER_UPDATED',
        version: 3,
        status: 'assigned',
        timeline: [{ type: 'ORDER_CREATED', timestamp: '2025-01-01T00:00:00Z' }],
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(assertOrderReadModelRow(row)).toBe(row);
    });
  });

  describe('deriveOrderStatus', () => {
    it('returns null when state is null', () => {
      expect(deriveOrderStatus(null)).toBeNull();
    });

    it('returns null when state is undefined', () => {
      expect(deriveOrderStatus(undefined)).toBeNull();
    });

    it('returns null when state is not an object', () => {
      expect(deriveOrderStatus('string')).toBeNull();
      expect(deriveOrderStatus(42)).toBeNull();
    });

    it('returns created when status is missing', () => {
      expect(deriveOrderStatus({})).toBe('created');
    });

    it('returns created when status is empty string', () => {
      expect(deriveOrderStatus({ status: '' })).toBe('created');
    });

    it('returns created when status is whitespace only', () => {
      expect(deriveOrderStatus({ status: '   ' })).toBe('created');
    });

    it('returns lowercase status for uppercase input', () => {
      expect(deriveOrderStatus({ status: 'CREATED' })).toBe('created');
      expect(deriveOrderStatus({ status: 'ASSIGNED' })).toBe('assigned');
      expect(deriveOrderStatus({ status: 'CANCELLED' })).toBe('cancelled');
    });

    it('returns lowercase status for lowercase input', () => {
      expect(deriveOrderStatus({ status: 'pending' })).toBe('pending');
      expect(deriveOrderStatus({ status: 'in_transit' })).toBe('in_transit');
    });

    it('trims whitespace before lowercasing', () => {
      expect(deriveOrderStatus({ status: '  ASSIGNED  ' })).toBe('assigned');
    });
  });

  describe('deriveEventTypeFromTimeline', () => {
    it('returns null when timeline is null', () => {
      expect(deriveEventTypeFromTimeline(null)).toBeNull();
    });

    it('returns null when timeline is undefined', () => {
      expect(deriveEventTypeFromTimeline(undefined)).toBeNull();
    });

    it('returns null when timeline is not an array', () => {
      expect(deriveEventTypeFromTimeline({})).toBeNull();
      expect(deriveEventTypeFromTimeline('string')).toBeNull();
    });

    it('returns null when timeline is empty', () => {
      expect(deriveEventTypeFromTimeline([])).toBeNull();
    });

    it('returns null when last event is not an object', () => {
      expect(deriveEventTypeFromTimeline([null])).toBeNull();
      expect(deriveEventTypeFromTimeline([42])).toBeNull();
    });

    it('returns null when last event has no type fields', () => {
      expect(deriveEventTypeFromTimeline([{ foo: 'bar' }])).toBeNull();
    });

    it('returns type when present', () => {
      const timeline = [{ type: 'ORDER_UPDATED' }];
      expect(deriveEventTypeFromTimeline(timeline)).toBe('ORDER_UPDATED');
    });

    it('falls back to event_type when type is absent', () => {
      const timeline = [{ event_type: 'ORDER_CREATED_V2' }];
      expect(deriveEventTypeFromTimeline(timeline)).toBe('ORDER_CREATED_V2');
    });

    it('returns the type of the last event', () => {
      const timeline = [
        { type: 'ORDER_CREATED' },
        { type: 'DRIVER_ASSIGNED' },
        { event_type: 'ORDER_IN_TRANSIT' },
      ];
      expect(deriveEventTypeFromTimeline(timeline)).toBe('ORDER_IN_TRANSIT');
    });
  });
});
