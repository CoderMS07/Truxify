import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config/demand', () => {
  let demandConfig;

  beforeEach(async () => {
    vi.resetModules();
    // Reset env vars
    delete process.env.DEMAND_BASE_EARNING_RATE;
    delete process.env.DEMAND_ROUTE_MULTIPLIER_BASE;
    delete process.env.DEMAND_ROUTE_MULTIPLIER_STEP;
    delete process.env.DEMAND_NEXT_24H_FACTOR;
    delete process.env.DEMAND_NEXT_48H_FACTOR;
    delete process.env.DEMAND_PEAK_HOURS;
    const mod = await import('../../src/config/demand.js');
    demandConfig = mod.demandConfig;
  });

  it('baseEarningRate defaults to 18.50', () => {
    expect(demandConfig.baseEarningRate).toBe(18.50);
  });

  it('routeMultiplierBase defaults to 1.2', () => {
    expect(demandConfig.routeMultiplierBase).toBe(1.2);
  });

  it('routeMultiplierStep defaults to 0.1', () => {
    expect(demandConfig.routeMultiplierStep).toBe(0.1);
  });

  it('next24HoursFactor defaults to 1.1', () => {
    expect(demandConfig.next24HoursFactor).toBe(1.1);
  });

  it('next48HoursFactor defaults to 0.95', () => {
    expect(demandConfig.next48HoursFactor).toBe(0.95);
  });

  it('peakHours defaults to expected array', () => {
    expect(demandConfig.peakHours).toEqual(['08:00 - 10:00', '17:00 - 19:00']);
  });

  it('baseEarningRate parses valid env number', async () => {
    process.env.DEMAND_BASE_EARNING_RATE = '25.00';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.baseEarningRate).toBe(25.00);
  });

  it('baseEarningRate falls back for invalid env string', async () => {
    process.env.DEMAND_BASE_EARNING_RATE = 'not-a-number';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.baseEarningRate).toBe(18.50);
  });

  it('baseEarningRate falls back for empty string', async () => {
    process.env.DEMAND_BASE_EARNING_RATE = '';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.baseEarningRate).toBe(18.50);
  });

  it('routeMultiplierBase parses valid env number', async () => {
    process.env.DEMAND_ROUTE_MULTIPLIER_BASE = '2.0';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.routeMultiplierBase).toBe(2.0);
  });

  it('routeMultiplierBase falls back for NaN', async () => {
    process.env.DEMAND_ROUTE_MULTIPLIER_BASE = 'abc';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.routeMultiplierBase).toBe(1.2);
  });

  it('peakHours parses comma-separated values', async () => {
    process.env.DEMAND_PEAK_HOURS = '06:00 - 08:00, 12:00 - 14:00, 18:00 - 20:00';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.peakHours).toEqual([
      '06:00 - 08:00',
      '12:00 - 14:00',
      '18:00 - 20:00',
    ]);
  });

  it('peakHours falls back for empty env', async () => {
    process.env.DEMAND_PEAK_HOURS = '';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.peakHours).toEqual(['08:00 - 10:00', '17:00 - 19:00']);
  });

  it('peakHours falls back for whitespace-only env', async () => {
    process.env.DEMAND_PEAK_HOURS = '   ';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.peakHours).toEqual(['08:00 - 10:00', '17:00 - 19:00']);
  });

  it('peakHours filters empty entries from split', async () => {
    process.env.DEMAND_PEAK_HOURS = '09:00-11:00,,12:00-14:00';
    vi.resetModules();
    const mod = await import('../../src/config/demand.js');
    expect(mod.demandConfig.peakHours).toEqual(['09:00-11:00', '12:00-14:00']);
  });
});
