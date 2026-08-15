import { describe, it, expect } from 'vitest';
import { BasePolicy } from '../../src/core/auth/BasePolicy.js';
import { Permission } from '../../src/core/auth/Permission.js';

describe('BasePolicy', () => {
  describe('constructor', () => {
    it('creates a policy with a given namespace', () => {
      const policy = new BasePolicy('order');
      expect(policy.namespace).toBe('order');
    });

    it('throws when namespace is not a non-empty string', () => {
      expect(() => new BasePolicy()).toThrow('BasePolicy requires a non-empty namespace string.');
      expect(() => new BasePolicy('')).toThrow('BasePolicy requires a non-empty namespace string.');
      expect(() => new BasePolicy(null)).toThrow('BasePolicy requires a non-empty namespace string.');
      expect(() => new BasePolicy(123)).toThrow('BasePolicy requires a non-empty namespace string.');
    });
  });

  describe('define', () => {
    it('adds a permission to the policy', () => {
      const policy = new BasePolicy('order');
      const perm = policy.define({ action: 'order:view', roles: ['driver'] });
      expect(perm).toBeInstanceOf(Permission);
      expect(perm.action).toBe('order:view');
    });

    it('returns the defined permission', () => {
      const policy = new BasePolicy('order');
      const perm = policy.define({ action: 'order:delete', roles: ['admin'] });
      expect(perm.action).toBe('order:delete');
    });
  });

  describe('getPermissions', () => {
    it('returns all defined permissions', () => {
      const policy = new BasePolicy('order');
      policy.define({ action: 'order:view', roles: ['driver'] });
      policy.define({ action: 'order:delete', roles: ['admin'] });
      const perms = policy.getPermissions();
      expect(perms).toHaveLength(2);
    });

    it('returns a copy of the permissions array', () => {
      const policy = new BasePolicy('order');
      policy.define({ action: 'order:view', roles: ['driver'] });
      const perms1 = policy.getPermissions();
      const perms2 = policy.getPermissions();
      expect(perms1).not.toBe(perms2);
      expect(perms1).toEqual(perms2);
    });
  });

  describe('toMap', () => {
    it('returns a Map of action to Permission', () => {
      const policy = new BasePolicy('order');
      policy.define({ action: 'order:view', roles: ['driver'] });
      policy.define({ action: 'order:delete', roles: ['admin'] });
      const map = policy.toMap();
      expect(map).toBeInstanceOf(Map);
      expect(map.get('order:view')).toBeDefined();
      expect(map.get('order:delete')).toBeDefined();
      expect(map.get('order:view').action).toBe('order:view');
    });

    it('returns an empty Map when no permissions defined', () => {
      const policy = new BasePolicy('order');
      const map = policy.toMap();
      expect(map.size).toBe(0);
    });
  });

  describe('multiple define calls', () => {
    it('accumulates permissions correctly', () => {
      const policy = new BasePolicy('driver');
      policy.define({ action: 'driver:view', roles: ['driver'] });
      policy.define({ action: 'driver:update', roles: ['driver'] });
      policy.define({ action: 'driver:delete', roles: ['admin'] });
      expect(policy.getPermissions()).toHaveLength(3);
      expect(policy.toMap().size).toBe(3);
    });
  });
});
