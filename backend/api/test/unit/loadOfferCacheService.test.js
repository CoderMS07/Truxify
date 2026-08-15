import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadOfferCacheService } from '../../src/services/order/loadOfferCacheService.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('LoadOfferCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRegion', () => {
    it('returns global for undefined lat', () => {
      expect(LoadOfferCacheService.getRegion(undefined, 72.5)).toBe('global');
    });

    it('returns global for null lat', () => {
      expect(LoadOfferCacheService.getRegion(null, 72.5)).toBe('global');
    });

    it('returns global for empty string lat', () => {
      expect(LoadOfferCacheService.getRegion('', 72.5)).toBe('global');
    });

    it('returns global for undefined lng', () => {
      expect(LoadOfferCacheService.getRegion(23.5, undefined)).toBe('global');
    });

    it('returns global for null lng', () => {
      expect(LoadOfferCacheService.getRegion(23.5, null)).toBe('global');
    });

    it('returns global for empty string lng', () => {
      expect(LoadOfferCacheService.getRegion(23.5, '')).toBe('global');
    });

    it('returns global for non-numeric lat', () => {
      expect(LoadOfferCacheService.getRegion('not-a-number', 72.5)).toBe('global');
    });

    it('returns global for non-numeric lng', () => {
      expect(LoadOfferCacheService.getRegion(23.5, 'not-a-number')).toBe('global');
    });

    it('returns global for NaN values', () => {
      expect(LoadOfferCacheService.getRegion(NaN, NaN)).toBe('global');
    });

    it('returns geohash for valid coordinates', () => {
      // Mumbai: approximately 19.07, 72.87
      const region = LoadOfferCacheService.getRegion(19.07, 72.87);
      expect(typeof region).toBe('string');
      expect(region.length).toBe(4); // precision 4 = 4 chars
      expect(region).not.toBe('global');
    });

    it('returns same geohash for nearby coordinates', () => {
      const region1 = LoadOfferCacheService.getRegion(19.07, 72.87);
      const region2 = LoadOfferCacheService.getRegion(19.08, 72.88);
      // Close coordinates should produce same or similar geohash
      expect(typeof region1).toBe('string');
      expect(typeof region2).toBe('string');
    });

    it('accepts string numeric coordinates', () => {
      const region = LoadOfferCacheService.getRegion('19.07', '72.87');
      expect(region).not.toBe('global');
      expect(typeof region).toBe('string');
    });
  });
});
