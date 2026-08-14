import { describe, it, expect } from 'vitest';
import { success, error, paginated } from '../../src/lib/apiResponse.js';

describe('apiResponse', () => {
  describe('success', () => {
    it('returns correct shape with defaults', () => {
      const result = success();
      expect(result).toEqual({
        success: true,
        statusCode: 200,
        message: 'Success',
        data: null,
      });
    });

    it('uses provided data', () => {
      const result = success({ id: '123' });
      expect(result.data).toEqual({ id: '123' });
    });

    it('uses provided message', () => {
      const result = success(null, 'Created successfully');
      expect(result.message).toBe('Created successfully');
    });

    it('uses provided statusCode', () => {
      const result = success(null, 'OK', 201);
      expect(result.statusCode).toBe(201);
    });

    it('accepts all parameters', () => {
      const result = success({ items: [1, 2, 3] }, 'Found items', 200);
      expect(result).toEqual({
        success: true,
        statusCode: 200,
        message: 'Found items',
        data: { items: [1, 2, 3] },
      });
    });
  });

  describe('error', () => {
    it('returns correct shape with defaults', () => {
      const result = error();
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.message).toBe('An error occurred');
    });

    it('uses provided message', () => {
      const result = error('Not found');
      expect(result.message).toBe('Not found');
      expect(result.statusCode).toBe(500);
    });

    it('uses provided statusCode', () => {
      const result = error('Not authorized', 403);
      expect(result.statusCode).toBe(403);
    });

    it('includes errors array when provided', () => {
      const errors = [{ field: 'email', msg: 'Invalid' }];
      const result = error('Validation failed', 400, errors);
      expect(result.errors).toEqual(errors);
    });

    it('does not include errors when null', () => {
      const result = error('Server error', 500, null);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('paginated', () => {
    it('returns correct shape', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const result = paginated(items, 1, 10, 25);
      expect(result).toEqual({
        success: true,
        message: 'Success',
        data: items,
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      });
    });

    it('calculates totalPages correctly', () => {
      const result = paginated([], 1, 10, 30);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('handles zero total', () => {
      const result = paginated([], 1, 10, 0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('uses default pagination values', () => {
      const result = paginated([1, 2]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('uses provided custom message', () => {
      const result = paginated([], 1, 10, 0, 'No data found');
      expect(result.message).toBe('No data found');
    });
  });
});
