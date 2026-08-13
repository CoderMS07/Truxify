import { describe, it, expect } from 'vitest';
import { reverseGeocode } from '../../../src/lib/reverseGeocode.js';

describe('reverseGeocode', () => {
  it('returns null for null latitude', async () => {
    const result = await reverseGeocode(null, 77.5);
    expect(result).toBe(null);
  });

  it('returns null for null longitude', async () => {
    const result = await reverseGeocode(28.6, null);
    expect(result).toBe(null);
  });

  it('returns null for NaN latitude', async () => {
    const result = await reverseGeocode(NaN, 77.5);
    expect(result).toBe(null);
  });

  it('returns null for NaN longitude', async () => {
    const result = await reverseGeocode(28.6, NaN);
    expect(result).toBe(null);
  });

  it('returns null for out-of-range latitude below -90', async () => {
    const result = await reverseGeocode(-91, 77.5);
    expect(result).toBe(null);
  });

  it('returns null for out-of-range latitude above 90', async () => {
    const result = await reverseGeocode(91, 77.5);
    expect(result).toBe(null);
  });

  it('returns null for out-of-range longitude above 180', async () => {
    const result = await reverseGeocode(28.6, 181);
    expect(result).toBe(null);
  });

  it('returns null for out-of-range longitude below -180', async () => {
    const result = await reverseGeocode(28.6, -181);
    expect(result).toBe(null);
  });
});
