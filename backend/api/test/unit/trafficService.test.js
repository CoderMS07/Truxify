import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('globalThis', () => ({
  fetch: vi.fn(),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getLiveTrafficMultiplier } from '../../src/services/trafficService.js';

describe('trafficService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 1.0 for null coordinates', async () => {
    const result = await getLiveTrafficMultiplier(null, null);
    expect(result).toBe(1.0);
  });

  it('returns 1.0 for undefined coordinates', async () => {
    const result = await getLiveTrafficMultiplier(undefined, undefined);
    expect(result).toBe(1.0);
  });

  it('returns 1.0 for non-finite coordinates', async () => {
    expect(await getLiveTrafficMultiplier(NaN, 40)).toBe(1.0);
    expect(await getLiveTrafficMultiplier(40, Infinity)).toBe(1.0);
  });

  it('returns 1.0 when TOMTOM API key is absent and fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await getLiveTrafficMultiplier(40.7128, -74.006);
    expect(result).toBe(1.0);
  });
});
