import { describe, it, expect, vi } from 'vitest';
import { success, error } from '../../src/utils/apiResponseHelpers.js';

describe('apiResponseHelpers', () => {
  describe('success', () => {
    it('returns success response with data', () => {
      const result = success({ id: 1 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
      expect(result.meta).toBeUndefined();
    });

    it('includes meta when provided', () => {
      const result = success({ items: [1, 2] }, { total: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ items: [1, 2] });
      expect(result.meta).toEqual({ total: 10 });
    });

    it('includes meta when meta is an empty object', () => {
      const result = success(null, {});
      expect(result.success).toBe(true);
      expect(result.meta).toEqual({});
    });

    it('handles various data types as payload', () => {
      expect(success(42).data).toBe(42);
      expect(success('hello').data).toBe('hello');
      expect(success([1, 2, 3]).data).toEqual([1, 2, 3]);
      expect(success(null).data).toBe(null);
    });
  });

  describe('error', () => {
    it('returns error response with message only', () => {
      const result = error('Something went wrong');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Something went wrong');
      expect(result.error.code).toBeUndefined();
      expect(result.error.details).toBeUndefined();
    });

    it('includes error code when provided', () => {
      const result = error('Bad request', 'VALIDATION_ERROR');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Bad request');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('includes details when provided', () => {
      const result = error('Conflict', 'CONFLICT', { field: 'email' });
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Conflict');
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.details).toEqual({ field: 'email' });
    });

    it('omits code when undefined', () => {
      const result = error('Error', undefined, { info: 'x' });
      expect(result.error.code).toBeUndefined();
      expect(result.error.details).toEqual({ info: 'x' });
    });

    it('omits details when undefined', () => {
      const result = error('Error', 'ERR');
      expect(result.error.details).toBeUndefined();
    });
  });
});
