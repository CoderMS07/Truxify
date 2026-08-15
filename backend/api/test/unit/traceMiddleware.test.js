import { describe, it, expect, vi } from 'vitest';

describe('TraceMiddleware', () => {
  it('can be imported', async () => {
    const mod = await import('../../src/core/telemetry/TraceMiddleware.js');
    expect(mod).toBeDefined();
  });

  it('finish callback sets span status to OK on 2xx', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    mockRes.statusCode = 200;
    fn(mockReq, mockRes, mockNext);
    const finishCb = mockRes.on.mock.calls.find((c) => c[0] === 'finish')[1];
    finishCb();
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
  });

  it('records error on response error event', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    const errorCb = mockRes.on.mock.calls.find((c) => c[0] === 'error')[1];
    const testError = new Error('connection reset');
    errorCb(testError);
    expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
  });

  it('ends span on finish', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    const finishCb = mockRes.on.mock.calls.find((c) => c[0] === 'finish')[1];
    finishCb();
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('sets http.response_time_ms attribute on finish', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    const finishCb = mockRes.on.mock.calls.find((c) => c[0] === 'finish')[1];
    finishCb();
    expect(mockSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.status_code': 200,
        'http.response_time_ms': expect.any(Number),
      }),
    );
  });
});

describe('TraceMiddleware — createWorkerContextFromRequest', () => {
  it('returns empty object when req._traceSnapshot is missing', async () => {
    const { createWorkerContextFromRequest } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const result = createWorkerContextFromRequest({});
    expect(result).toEqual({});
  });

  it('returns traceSnapshot when req._traceSnapshot is present', async () => {
    const { createWorkerContextFromRequest } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const snapshot = { traceparent: '00-abc-def' };
    const result = createWorkerContextFromRequest({ _traceSnapshot: snapshot });
    expect(result).toEqual({ traceSnapshot: snapshot });
  });
});

describe('TraceMiddleware — propagateContextToBackground', () => {
  it('returns null when req._traceSnapshot is missing', async () => {
    const { propagateContextToBackground } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const result = propagateContextToBackground({});
    expect(result).toBeNull();
  });

  it('returns context object with traceSnapshot and correlationId', async () => {
    const { propagateContextToBackground } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const snapshot = { traceparent: '00-abc-def' };
    const req = {
      _traceSnapshot: snapshot,
      correlationId: 'corr-123',
      traceId: 'trace-abc',
    };
    const result = propagateContextToBackground(req, { source: 'test-source' });
    expect(result.traceSnapshot).toBe(snapshot);
    expect(result.correlationId).toBe('corr-123');
    expect(result.traceId).toBe('trace-abc');
    expect(result.source).toBe('test-source');
  });

  it('uses default source when not provided', async () => {
    const { propagateContextToBackground } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const req = { _traceSnapshot: {}, traceId: 'trace-abc' };
    const result = propagateContextToBackground(req);
    expect(result.source).toBe('http-request');
  });
});

describe('TraceMiddleware — restoreBackgroundContext', () => {
  it('runs fn immediately when contextData.traceSnapshot is missing', async () => {
    const { restoreBackgroundContext } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    const fn = vi.fn(() => 'result');
    const result = restoreBackgroundContext({}, fn);
    expect(fn).toHaveBeenCalled();
    expect(result).toBe('result');
  });
});
