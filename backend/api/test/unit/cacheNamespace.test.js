import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('CacheNamespace', () => {
  let CacheNamespace;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../../src/cache/CacheNamespace.js');
    CacheNamespace = mod.CacheNamespace;
    // Clear all built-in namespaces for isolation
    CacheNamespace.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── register ────────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a new namespace', () => {
      const entry = CacheNamespace.register('test_ns', { defaultTtl: 600 });
      expect(entry.name).toBe('test_ns');
      expect(entry.prefix).toBe('test_ns');
      expect(entry.defaultTtl).toBe(600);
      expect(entry.enablePubSub).toBe(true);
    });

    it('uses provided prefix over name', () => {
      const entry = CacheNamespace.register('profile', { prefix: 'user:profile', defaultTtl: 900 });
      expect(entry.prefix).toBe('user:profile');
    });

    it('defaults enablePubSub to true', () => {
      const entry = CacheNamespace.register('test_ns');
      expect(entry.enablePubSub).toBe(true);
    });

    it('allows disabling PubSub via opts', () => {
      const entry = CacheNamespace.register('test_ns', { enablePubSub: false });
      expect(entry.enablePubSub).toBe(false);
    });

    it('defaults defaultTtl to 900 when not provided', () => {
      const entry = CacheNamespace.register('test_ns');
      expect(entry.defaultTtl).toBe(900);
    });

    it('returns existing entry when registering same name twice', () => {
      const entry1 = CacheNamespace.register('test_ns', { defaultTtl: 600 });
      const entry2 = CacheNamespace.register('test_ns', { defaultTtl: 999 });
      expect(entry1).toBe(entry2);
      expect(entry1.defaultTtl).toBe(600);
    });
  });

  // ── get ────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('retrieves a registered namespace', () => {
      CacheNamespace.register('my_ns', { defaultTtl: 100 });
      const entry = CacheNamespace.get('my_ns');
      expect(entry).toBeDefined();
      expect(entry.name).toBe('my_ns');
    });

    it('returns undefined for unregistered namespace', () => {
      const entry = CacheNamespace.get('nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  // ── isValid ────────────────────────────────────────────────────────────

  describe('isValid', () => {
    it('returns true for registered namespace', () => {
      CacheNamespace.register('valid_ns');
      expect(CacheNamespace.isValid('valid_ns')).toBe(true);
    });

    it('returns false for unregistered namespace', () => {
      expect(CacheNamespace.isValid('invalid')).toBe(false);
    });

    it('returns false after namespace is cleared', () => {
      CacheNamespace.register('transient');
      expect(CacheNamespace.isValid('transient')).toBe(true);
      CacheNamespace.clear();
      expect(CacheNamespace.isValid('transient')).toBe(false);
    });
  });

  // ── names ──────────────────────────────────────────────────────────────

  describe('names', () => {
    it('returns empty array when no namespaces registered', () => {
      expect(CacheNamespace.names()).toEqual([]);
    });

    it('returns all registered namespace names', () => {
      CacheNamespace.register('ns1');
      CacheNamespace.register('ns2');
      CacheNamespace.register('ns3');
      const names = CacheNamespace.names();
      expect(names).toContain('ns1');
      expect(names).toContain('ns2');
      expect(names).toContain('ns3');
      expect(names).toHaveLength(3);
    });

    it('does not return duplicate names', () => {
      CacheNamespace.register('ns1');
      CacheNamespace.register('ns1');
      expect(CacheNamespace.names()).toEqual(['ns1']);
    });
  });

  // ── all ────────────────────────────────────────────────────────────────

  describe('all', () => {
    it('returns a Map of all entries', () => {
      CacheNamespace.register('a', { defaultTtl: 1 });
      CacheNamespace.register('b', { defaultTtl: 2 });
      const all = CacheNamespace.all();
      expect(all).toBeInstanceOf(Map);
      expect(all.get('a').defaultTtl).toBe(1);
      expect(all.get('b').defaultTtl).toBe(2);
    });

    it('returns empty Map when cleared', () => {
      CacheNamespace.register('x');
      CacheNamespace.clear();
      expect(CacheNamespace.all().size).toBe(0);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all registered namespaces', () => {
      CacheNamespace.register('one');
      CacheNamespace.register('two');
      CacheNamespace.clear();
      expect(CacheNamespace.names()).toEqual([]);
    });

    it('allows re-registering after clear', () => {
      CacheNamespace.register('reused');
      CacheNamespace.clear();
      CacheNamespace.register('reused', { defaultTtl: 500 });
      expect(CacheNamespace.get('reused').defaultTtl).toBe(500);
    });
  });

  // ── namespace isolation ───────────────────────────────────────────────

  describe('namespace isolation', () => {
    it('different namespaces produce different prefixes', () => {
      const a = CacheNamespace.register('service_a', { prefix: 'svc_a' });
      const b = CacheNamespace.register('service_b', { prefix: 'svc_b' });
      expect(a.prefix).not.toBe(b.prefix);
    });

    it('same entityId under different namespaces yields different keys', () => {
      CacheNamespace.register('ns1', { prefix: 'prefix1' });
      CacheNamespace.register('ns2', { prefix: 'prefix2' });
      const key1 = `${CacheNamespace.get('ns1').prefix}:entity-1`;
      const key2 = `${CacheNamespace.get('ns2').prefix}:entity-1`;
      expect(key1).not.toBe(key2);
    });

    it('defaultTtl is independent per namespace', () => {
      CacheNamespace.register('fast', { defaultTtl: 10 });
      CacheNamespace.register('slow', { defaultTtl: 3600 });
      expect(CacheNamespace.get('fast').defaultTtl).not.toBe(
        CacheNamespace.get('slow').defaultTtl,
      );
    });

    it('enablePubSub is independent per namespace', () => {
      CacheNamespace.register('pubsub_enabled', { enablePubSub: true });
      CacheNamespace.register('pubsub_disabled', { enablePubSub: false });
      expect(CacheNamespace.get('pubsub_enabled').enablePubSub).toBe(true);
      expect(CacheNamespace.get('pubsub_disabled').enablePubSub).toBe(false);
    });
  });

  // ── key prefixing ─────────────────────────────────────────────────────

  describe('key prefixing', () => {
    it('prefix defaults to namespace name when not provided', () => {
      const entry = CacheNamespace.register('my_ns');
      expect(entry.prefix).toBe('my_ns');
    });

    it('custom prefix is used when provided', () => {
      const entry = CacheNamespace.register('profile', { prefix: 'user:profile' });
      expect(entry.prefix).toBe('user:profile');
    });

    it('prefix is used in building cache keys', () => {
      CacheNamespace.register('driver', { prefix: 'driver:v1' });
      const entry = CacheNamespace.get('driver');
      const key = `${entry.prefix}:driver-123`;
      expect(key).toBe('driver:v1:driver-123');
    });
  });
});
