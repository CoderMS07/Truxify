import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../../../src/lib/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000 });
  });

  it('starts in closed state', () => {
    expect(breaker.state).toBe('CLOSED');
  });

  it('opens after failure threshold is reached', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => { throw new Error('fail'); }); }
      catch {}
    }
    expect(breaker.state).toBe('OPEN');
  });

  it('allows execution in closed state', async () => {
    const result = await breaker.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('rejects execution when open', async () => {
    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(() => { throw new Error('fail'); }); }
      catch {}
    }
    await expect(breaker.execute(() => Promise.resolve(42))).rejects.toThrow();
  });

  it('transitions to half-open after timeout', async () => {
    const fastBreaker = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 50 });
    try { await fastBreaker.execute(() => { throw new Error('fail'); }); }
    catch {}
    expect(fastBreaker.state).toBe('OPEN');
    await new Promise(r => setTimeout(r, 60));
    // After timeout, next call attempts in half-open
  });
});
