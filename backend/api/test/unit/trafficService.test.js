import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLiveTrafficMultiplier } from '../../src/services/trafficService.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('trafficService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TOMTOM_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  describe('getLiveTrafficMultiplier', () => {
    it('returns 1.0 when pickupLat is missing', async () => {
      const result = await getLiveTrafficMultiplier(null, 72.5);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 when pickupLng is missing', async () => {
      const result = await getLiveTrafficMultiplier(23.5, null);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 when both coordinates are missing', async () => {
      const result = await getLiveTrafficMultiplier(null, null);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 when no API key is configured (uses rush-hour multiplier at non-rush hours)', async () => {
      // No API keys set - uses rush hour multiplier
      // Mock Date to be non-rush hour
      const fakeDate = new Date('2025-01-15T12:00:00Z'); // noon - not rush hour
      vi.spyOn(global, 'Date').mockImplementation((arg) => {
        if (arg) return new global.Date(arg);
        return fakeDate;
      });
      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBe(1.0);
      vi.restoreAllMocks();
    });

    it('returns a multiplier > 1.0 when TomTom API key is set and returns valid data', async () => {
      process.env.TOMTOM_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ flowSegmentData: { speedDiffPercent: 30 } }),
      });
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBeGreaterThan(1.0);
      expect(result).toBeLessThanOrEqual(2.5);
    });

    it('returns 1.0 when TomTom API call fails', async () => {
      process.env.TOMTOM_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 when fetch throws', async () => {
      process.env.TOMTOM_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 when Google Maps API call fails', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBe(1.0);
    });

    it('returns multiplier from TomTom speedDiffPercent', async () => {
      process.env.TOMTOM_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ flowSegmentData: { speedDiffPercent: 50 } }),
      });
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      // 1.0 + 0.5 = 1.5, clamped to max 2.5
      expect(result).toBe(1.5);
    });

    it('clamps multiplier to MAX_SURGE_MULTIPLIER (2.5)', async () => {
      process.env.TOMTOM_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ flowSegmentData: { speedDiffPercent: 500 } }),
      });
      global.fetch = mockFetch;

      const result = await getLiveTrafficMultiplier(23.5, 72.5);
      expect(result).toBe(2.5);
    });
  });
});
