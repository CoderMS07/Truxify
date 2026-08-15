import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheNamespace } from '../../src/cache/CacheNamespace.js';

describe('CacheNamespace', () => {
  beforeEach(() => {
    CacheNamespace.clear();
  });

  describe('register and get', () => {
    it('registers and retrieves a namespace', () => {
      CacheNamespace.register('test_ns', { defaultTtl: 300 });
      const ns = CacheNamespace.get('test_ns');
      expect(ns).toBeDefined();
      expect(ns.defaultTtl).toBe(300);
    });

    it('uses default TTL of 900 when not specified', () => {
      CacheNamespace.register('no_ttl');
      const ns = CacheNamespace.get('no_ttl');
      expect(ns.defaultTtl).toBe(900);
    });

    it('uses name as prefix when not specified', () => {
      CacheNamespace.register('my_ns');
      const ns = CacheNamespace.get('my_ns');
      expect(ns.prefix).toBe('my_ns');
    });

    it('uses custom prefix when provided', () => {
      CacheNamespace.register('custom', { prefix: 'cache:custom' });
      const ns = CacheNamespace.get('custom');
      expect(ns.prefix).toBe('cache:custom');
    });

    it('enables pubsub by default', () => {
      CacheNamespace.register('default_pubsub');
      const ns = CacheNamespace.get('default_pubsub');
      expect(ns.enablePubSub).toBe(true);
    });

    it('disables pubsub when enablePubSub is false', () => {
      CacheNamespace.register('no_pubsub', { enablePubSub: false });
      const ns = CacheNamespace.get('no_pubsub');
      expect(ns.enablePubSub).toBe(false);
    });

    it('returns existing entry without overwriting when registering twice', () => {
      CacheNamespace.register('dup_ns', { defaultTtl: 100 });
      CacheNamespace.register('dup_ns', { defaultTtl: 999 });
      const ns = CacheNamespace.get('dup_ns');
      // Should keep the first registration
      expect(ns.defaultTtl).toBe(100);
    });
  });

  describe('isValid', () => {
    it('returns true for registered namespace', () => {
      CacheNamespace.register('valid_ns');
      expect(CacheNamespace.isValid('valid_ns')).toBe(true);
    });

    it('returns false for unregistered namespace', () => {
      expect(CacheNamespace.isValid('nonexistent')).toBe(false);
    });
  });

  describe('names', () => {
    it('returns all registered namespace names', () => {
      CacheNamespace.register('ns1');
      CacheNamespace.register('ns2');
      const names = CacheNamespace.names();
      expect(names).toContain('ns1');
      expect(names).toContain('ns2');
    });
  });

  describe('all', () => {
    it('returns a copy of the namespaces map', () => {
      CacheNamespace.register('copy_ns', { defaultTtl: 500 });
      const all = CacheNamespace.all();
      expect(all.get('copy_ns').defaultTtl).toBe(500);
    });
  });

  describe('clear', () => {
    it('removes all registered namespaces', () => {
      CacheNamespace.register('clearable');
      CacheNamespace.clear();
      expect(CacheNamespace.isValid('clearable')).toBe(false);
      expect(CacheNamespace.names()).toHaveLength(0);
    });
  });
});
