import { describe, it, expect } from 'vitest';
import { success, error } from '../../src/utils/apiResponseHelpers.js';

describe('apiResponseHelpers', () => {
  describe('success', () => {
    it('returns correct shape with data', () => {
      const result = success({ id: '123' });
      expect(result).toEqual({ success: true, data: { id: '123' } });
    });

    it('returns correct shape without meta', () => {
      const result = success(null);
      expect(result).toEqual({ success: true, data: null });
      expect(result.meta).toBeUndefined();
    });

    it('includes meta when provided', () => {
      const result = success([1, 2, 3], { page: 1, total: 10 });
      expect(result).toEqual({
        success: true,
        data: [1, 2, 3],
        meta: { page: 1, total: 10 },
      });
    });

    it('omits meta when undefined', () => {
      const result = success('test', undefined);
      expect(result.meta).toBeUndefined();
    });
  });

  describe('error', () => {
    it('returns correct shape with message only', () => {
      const result = error('Something went wrong');
      expect(result).toEqual({ success: false, error: 'Something went wrong' });
    });

    it('includes code when provided', () => {
      const result = error('Not found', 'NOT_FOUND');
      expect(result).toEqual({ success: false, error: 'Not found', code: 'NOT_FOUND' });
    });

    it('includes details when provided', () => {
      const result = error('Validation failed', 'VALIDATION_ERROR', { fields: ['email'] });
      expect(result).toEqual({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: { fields: ['email'] },
      });
    });

    it('omits code when undefined', () => {
      const result = error('Error', undefined, { extra: 'info' });
      expect(result.code).toBeUndefined();
      expect(result.details).toEqual({ extra: 'info' });
    });

    it('omits both code and details when only message provided', () => {
      const result = error('Error');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Error');
      expect(result.code).toBeUndefined();
      expect(result.details).toBeUndefined();
    });
  });
});
