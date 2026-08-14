import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWorkerContextFromRequest,
  propagateContextToBackground,
  restoreBackgroundContext,
} from '../../src/core/telemetry/TraceMiddleware.js';

vi.mock('../../src/tracing/tracing.js', () => ({
  default: {
    initialize: vi.fn(),
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({
        setStatus: vi.fn(),
        setAttributes: vi.fn(),
        end: vi.fn(),
        spanContext: () => ({ traceId: 'mock-trace-id', spanId: 'mock-span-id' }),
      })),
    })),
  },
}));

vi.mock('../../src/core/telemetry/SpanFactory.js', () => ({
  default: {
    startSpan: vi.fn(() => ({
      setStatus: vi.fn(),
      setAttributes: vi.fn(),
      end: vi.fn(),
      spanContext: () => ({ traceId: 'mock-trace-id', spanId: 'mock-span-id' }),
    })),
    startWorkerSpan: vi.fn(() => ({
      setStatus: vi.fn(),
      end: vi.fn(),
      setAttributes: vi.fn(),
    })),
    recordError: vi.fn(),
  },
  STANDARD_ATTRIBUTES: {},
}));

describe('TraceMiddleware utilities', () => {
  describe('createWorkerContextFromRequest', () => {
    it('returns empty object when req is undefined', () => {
      expect(createWorkerContextFromRequest(undefined)).toEqual({});
    });

    it('returns empty object when req is null', () => {
      expect(createWorkerContextFromRequest(null)).toEqual({});
    });

    it('returns empty object when req has no _traceSnapshot', () => {
      expect(createWorkerContextFromRequest({})).toEqual({});
    });

    it('returns traceSnapshot when available', () => {
      const snapshot = { traceId: 'abc123' };
      const result = createWorkerContextFromRequest({ _traceSnapshot: snapshot });
      expect(result).toEqual({ traceSnapshot: snapshot });
    });
  });

  describe('propagateContextToBackground', () => {
    it('returns null when req is undefined', () => {
      expect(propagateContextToBackground(undefined)).toBeNull();
    });

    it('returns null when req has no _traceSnapshot', () => {
      expect(propagateContextToBackground({})).toBeNull();
    });

    it('returns trace context data with default source', () => {
      const req = {
        _traceSnapshot: { traceId: 'abc' },
        correlationId: 'corr-1',
        traceId: 'trace-abc',
      };
      const result = propagateContextToBackground(req);
      expect(result.traceSnapshot).toEqual({ traceId: 'abc' });
      expect(result.correlationId).toBe('corr-1');
      expect(result.traceId).toBe('trace-abc');
      expect(result.source).toBe('http-request');
    });

    it('uses custom source when provided', () => {
      const req = { _traceSnapshot: {}, traceId: 'x' };
      const result = propagateContextToBackground(req, { source: 'custom-source' });
      expect(result.source).toBe('custom-source');
    });
  });

  describe('restoreBackgroundContext', () => {
    it('runs fn when contextData has no traceSnapshot', async () => {
      const fn = vi.fn(() => Promise.resolve('result'));
      const result = await restoreBackgroundContext({}, fn);
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('runs fn when contextData is null', async () => {
      const fn = vi.fn(() => Promise.resolve('done'));
      const result = await restoreBackgroundContext(null, fn);
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('done');
    });

    it('runs fn and returns its result when contextData is valid', async () => {
      const fn = vi.fn(() => Promise.resolve('bg-result'));
      const contextData = {
        traceSnapshot: { traceId: 'bg-trace' },
        correlationId: 'bg-corr',
        traceId: 'bg-tid',
        source: 'background',
      };
      const result = await restoreBackgroundContext(contextData, fn);
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('bg-result');
    });

    it('runs fn synchronously when traceSnapshot is missing', async () => {
      const fn = vi.fn(() => 'sync-result');
      const result = restoreBackgroundContext({ source: 'x' }, fn);
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('sync-result');
    });
  });
});
