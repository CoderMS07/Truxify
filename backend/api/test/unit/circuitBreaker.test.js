import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../src/lib/circuitBreaker.js';

describe('CircuitBreaker Unit Tests', () => {
  it('starts in CLOSED state and executes function successfully', async () => {
    const breaker = new CircuitBreaker('testBreaker');
    const fn = vi.fn().mockResolvedValue('ok');

    const res = await breaker.execute(fn);

    expect(res).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('opens circuit after reaching failure threshold', async () => {
    const breaker = new CircuitBreaker('testThresholdBreaker', {
      failureThreshold: 2,
      resetTimeoutMs: 10000,
    });
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(breaker.execute(fn)).rejects.toThrow('Network error');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await expect(breaker.execute(fn)).rejects.toThrow('Network error');
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('uses fallback function when circuit is OPEN', async () => {
    const fallback = vi.fn().mockReturnValue('fallback-data');
    const breaker = new CircuitBreaker('testFallbackBreaker', {
      failureThreshold: 1,
      fallback,
    });
    const fn = vi.fn().mockRejectedValue(new Error('Downstream offline'));

    const res1 = await breaker.execute(fn);
    expect(res1).toBe('fallback-data');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    const res2 = await breaker.execute(fn);
    expect(res2).toBe('fallback-data');
    expect(fn).toHaveBeenCalledTimes(1); // Function not invoked when OPEN
  });

  it('transitions to HALF_OPEN after resetTimeoutMs expires', async () => {
    const breaker = new CircuitBreaker('testHalfOpenBreaker', {
      failureThreshold: 1,
      resetTimeoutMs: 100,
    });
    const fnFail = vi.fn().mockRejectedValue(new Error('Error'));
    await expect(breaker.execute(fnFail)).rejects.toThrow();

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    await new Promise((r) => setTimeout(r, 120));

    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    const fnSuccess = vi.fn().mockResolvedValue('recovered');
    const res = await breaker.execute(fnSuccess);
    expect(res).toBe('recovered');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});
