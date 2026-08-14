import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenTelemetry API
vi.mock('@opentelemetry/api', () => {
  const mockSpan = {
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    addEvent: vi.fn(),
    spanContext: vi.fn(() => ({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
    })),
  };

  return {
    context: {
      active: vi.fn(() => ({})),
      with: vi.fn((ctx, fn) => fn()),
    },
    trace: {
      setSpan: vi.fn(() => ({})),
      getSpan: vi.fn(() => mockSpan),
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
  };
});

vi.mock('../../src/tracing/tracing.js', () => ({
  default: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => {
        const mockSpan = {
          setAttributes: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
          recordException: vi.fn(),
          addEvent: vi.fn(),
          spanContext: vi.fn(() => ({
            traceId: '0af7651916cd43dd8448eb211c80319c',
            spanId: 'b7ad6b7169203331',
          })),
        };
        return mockSpan;
      }),
    })),
  },
}));

vi.mock('../../src/core/telemetry/TraceContext.js', () => ({
  TraceContext: {
    injectIntoHeaders: vi.fn((h) => h),
    extractFromHeaders: vi.fn(() => ({})),
    serialize: vi.fn(() => ({})),
    deserialize: vi.fn(() => ({})),
    runWithContext: vi.fn((ctx, fn) => fn()),
    getActiveSpan: vi.fn(() => null),
    getActiveTraceId: vi.fn(() => '0af7651916cd43dd8448eb211c80319c'),
    getActiveSpanId: vi.fn(() => 'b7ad6b7169203331'),
    getActiveSpanContext: vi.fn(() => null),
    isValid: vi.fn(() => false),
    getCorrelationId: vi.fn(() => null),
    currentContext: vi.fn(() => ({})),
  },
}));

vi.mock('../../src/core/telemetry/ContextPropagator.js', () => ({
  ContextPropagator: {
    snapshot: vi.fn(() => ({})),
    restore: vi.fn((snapshot, fn) => fn()),
  },
}));

vi.mock('../../src/core/telemetry/SpanFactory.js', () => {
  const mockSpan = {
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    addEvent: vi.fn(),
    spanContext: vi.fn(() => ({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
    })),
  };
  return {
    default: {
      startSpan: vi.fn(() => mockSpan),
      startWorkerSpan: vi.fn(() => mockSpan),
      recordError: vi.fn(),
    },
    STANDARD_ATTRIBUTES: {},
  };
});

describe('TraceMiddleware — enhancedTracingMiddleware', () => {
  let enhancedTracingMiddleware;
  let mockReq;
  let mockRes;
  let mockNext;
  let mockSpan;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mockSpanInstance = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
      addEvent: vi.fn(),
      spanContext: vi.fn(() => ({
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
      })),
    };
    mockSpan = mockSpanInstance;

    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    enhancedTracingMiddleware = fn;

    const tracing = await import('../../src/tracing/tracing.js');
    tracing.default.getTracer = vi.fn(() => ({
      startSpan: vi.fn(() => mockSpanInstance),
    }));

    mockReq = {
      path: '/api/drivers',
      method: 'GET',
      url: '/api/drivers',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      requestId: 'test-request-id',
      correlationId: 'test-correlation-id',
    };

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      on: vi.fn((event, cb) => {
        if (event === 'finish') {
          mockRes._finishCb = cb;
        }
        if (event === 'error') {
          mockRes._errorCb = cb;
        }
      }),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips /health path and calls next immediately', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    mockReq.path = '/health';
    fn(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('skips /metrics path', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    mockReq.path = '/metrics';
    fn(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('skips /favicon.ico path', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    mockReq.path = '/favicon.ico';
    fn(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next for normal routes', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets X-Trace-Id header on response', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'X-Trace-Id',
      '0af7651916cd43dd8448eb211c80319c',
    );
  });

  it('attaches span and trace info to request object', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockReq.span).toBeDefined();
    expect(mockReq.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(mockReq.spanId).toBe('b7ad6b7169203331');
  });

  it('attaches traceContext to request object', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockReq.traceContext).toBeDefined();
    expect(mockReq.traceContext.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(mockReq.traceContext.spanId).toBe('b7ad6b7169203331');
  });

  it('registers finish event listener on response', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('registers error event listener on response', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    fn(mockReq, mockRes, mockNext);
    expect(mockRes.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('finish callback sets span status to ERROR on 5xx', async () => {
    const { enhancedTracingMiddleware: fn } = await import(
      '../../src/core/telemetry/TraceMiddleware.js'
    );
    mockRes.statusCode = 500;
    fn(mockReq, mockRes, mockNext);
    // Trigger the finish callback
    const finishCb = mockRes.on.mock.calls.find((c) => c[0] === 'finish')[1];
    finishCb();
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'HTTP 500',
    });
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
