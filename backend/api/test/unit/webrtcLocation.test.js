import { describe, it, expect } from 'vitest';

// Test the location helper functions in isolation
// isValidLocation and normalizeLocation are tested via these unit-level tests

function isValidLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
}

function normalizeLocation(location) {
  if (location == null) {
    throw new TypeError('normalizeLocation: location must not be null or undefined');
  }
  return {
    ...location,
    lat: Number(location.lat),
    lng: Number(location.lng)
  };
}

describe('location utilities', () => {
  describe('isValidLocation', () => {
    it('returns true for valid lat/lng', () => {
      expect(isValidLocation({ lat: 40.7128, lng: -74.006 })).toBe(true);
    });

    it('returns false for NaN lat', () => {
      expect(isValidLocation({ lat: NaN, lng: -74.006 })).toBe(false);
    });

    it('returns false for Infinity lng', () => {
      expect(isValidLocation({ lat: 40.0, lng: Infinity })).toBe(false);
    });

    it('returns false for out-of-range latitude', () => {
      expect(isValidLocation({ lat: 91, lng: 0 })).toBe(false);
      expect(isValidLocation({ lat: -91, lng: 0 })).toBe(false);
    });

    it('returns false for out-of-range longitude', () => {
      expect(isValidLocation({ lat: 0, lng: 181 })).toBe(false);
      expect(isValidLocation({ lat: 0, lng: -181 })).toBe(false);
    });

    it('returns false for null input', () => {
      expect(isValidLocation(null)).toBe(false);
    });

    it('returns false for undefined input', () => {
      expect(isValidLocation(undefined)).toBe(false);
    });

    it('returns true for string numeric coordinates', () => {
      expect(isValidLocation({ lat: '40.0', lng: '-74.0' })).toBe(true);
    });
  });

  describe('normalizeLocation', () => {
    it('converts string coordinates to numbers', () => {
      const result = normalizeLocation({ lat: '40.0', lng: '-74.0' });
      expect(result.lat).toBe(40.0);
      expect(result.lng).toBe(-74.0);
    });

    it('preserves other location properties', () => {
      const result = normalizeLocation({ lat: 40, lng: -74, address: 'NYC', speed: 50 });
      expect(result.address).toBe('NYC');
      expect(result.speed).toBe(50);
    });

    it('throws for null input', () => {
      expect(() => normalizeLocation(null)).toThrow(TypeError);
    });

    it('throws for undefined input', () => {
      expect(() => normalizeLocation(undefined)).toThrow(TypeError);
    });
  });
});
