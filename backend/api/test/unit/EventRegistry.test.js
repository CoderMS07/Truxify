import { describe, it, expect } from 'vitest';
import { EventRegistry } from '../../src/core/events/EventRegistry.js';

describe('EventRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new EventRegistry();
  });

  describe('register', () => {
    it('registers an event type with metadata', () => {
      registry.register('order.created', { source: 'order-service', category: 'domain' });
      expect(registry.isValid('order.created')).toBe(true);
    });

    it('registers with default category "domain"', () => {
      registry.register('test.event', { source: 'test' });
      const def = registry.getDefinition('test.event');
      expect(def.category).toBe('domain');
    });

    it('accepts optional description', () => {
      registry.register('trip.started', { source: 'trip', description: 'Fired when a trip starts' });
      const def = registry.getDefinition('trip.started');
      expect(def.description).toBe('Fired when a trip starts');
    });

    it('registers a validator function', () => {
      const validator = (payload) => payload.amount > 0;
      registry.register('payment.processed', { source: 'payment' }, { validator });
      expect(registry.isValid('payment.processed')).toBe(true);
    });

    it('returns this for chaining', () => {
      const result = registry.register('test', { source: 'test' });
      expect(result).toBe(registry);
    });

    it('throws when eventType is not a string', () => {
      expect(() => registry.register(123, { source: 'test' })).toThrow('eventType must be a non-empty string');
    });

    it('throws when eventType is empty string', () => {
      expect(() => registry.register('', { source: 'test' })).toThrow('eventType must be a non-empty string');
    });
  });

  describe('isValid', () => {
    it('returns true for registered event type', () => {
      registry.register('order.paid', { source: 'payment' });
      expect(registry.isValid('order.paid')).toBe(true);
    });

    it('returns false for unregistered event type', () => {
      expect(registry.isValid('unknown.event')).toBe(false);
    });
  });

  describe('getDefinition', () => {
    it('returns definition for registered event type', () => {
      registry.register('driver.assigned', { source: 'dispatch', category: 'domain', description: 'Assigns driver' });
      const def = registry.getDefinition('driver.assigned');
      expect(def.source).toBe('dispatch');
      expect(def.category).toBe('domain');
      expect(def.description).toBe('Assigns driver');
    });

    it('returns null for unregistered event type', () => {
      expect(registry.getDefinition('ghost.event')).toBeNull();
    });
  });

  describe('validate', () => {
    it('returns valid:true for registered event with no validator', () => {
      registry.register('simple.event', { source: 'test' });
      expect(registry.validate('simple.event', {})).toEqual({ valid: true });
    });

    it('returns valid:false for unregistered event', () => {
      const result = registry.validate('unknown.event', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown event type');
    });

    it('runs validator and returns valid:true when it returns true', () => {
      registry.register('valid.event', { source: 'test' }, { validator: (p) => p.ok === true });
      const result = registry.validate('valid.event', { ok: true });
      expect(result.valid).toBe(true);
    });

    it('runs validator and returns valid:false with error message', () => {
      registry.register('checked.event', { source: 'test' }, { validator: (p) => p.value > 0 || 'value must be positive' });
      const result = registry.validate('checked.event', { value: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('value must be positive');
    });

    it('returns valid:false when validator returns false', () => {
      registry.register('strict.event', { source: 'test' }, { validator: () => false });
      const result = registry.validate('strict.event', { ok: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('catches validator exceptions', () => {
      registry.register('error.event', { source: 'test' }, { validator: () => { throw new Error('boom'); } });
      const result = registry.validate('error.event', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('boom');
    });
  });

  describe('getRegisteredTypes', () => {
    it('returns array of registered event type names', () => {
      registry.register('event.1', { source: 'a' });
      registry.register('event.2', { source: 'b' });
      const types = registry.getRegisteredTypes();
      expect(types).toContain('event.1');
      expect(types).toContain('event.2');
      expect(types.length).toBe(2);
    });

    it('returns empty array when nothing registered', () => {
      expect(registry.getRegisteredTypes()).toEqual([]);
    });
  });

  describe('remove', () => {
    it('removes a registered event type', () => {
      registry.register('temp.event', { source: 'test' });
      registry.remove('temp.event');
      expect(registry.isValid('temp.event')).toBe(false);
    });

    it('also removes associated validator', () => {
      const validator = () => true;
      registry.register('removing.event', { source: 'test' }, { validator });
      registry.remove('removing.event');
      const result = registry.validate('removing.event', {});
      expect(result.valid).toBe(false); // No validator anymore
    });

    it('returns this for chaining', () => {
      const result = registry.remove('ghost.event');
      expect(result).toBe(registry);
    });
  });
});
