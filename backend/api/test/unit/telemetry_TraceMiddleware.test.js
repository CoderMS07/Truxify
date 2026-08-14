import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';

vi.mock('../../src/tracing/tracing.js', () => ({
  default: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({
        spanContext: vi.fn(() => ({ traceId: 'trace-123', spanId: 'span-456' })),
        setSpan: vi.fn(),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      })),
    })),
  },
}));

vi.mock('../../src/core/telemetry/SpanFactory.js', () => ({
  default: {
    recordError: vi.fn(),
    startWorkerSpan: vi.fn(() => ({ end: vi.fn() })),
  },
  STANDARD_ATTRIBUTES: {},
}));

vi.mock('../../src/core/telemetry/ContextPropagator.js', () => ({
  ContextPropagator: {
    snapshot: vi.fn(() => 'snapshot-data'),
    restore: vi.fn((snap, fn) => fn()),
  },
}));

describe('traceMiddleware', () => {
  let enhancedTracingMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/core/telemetry/TraceMiddleware.js');
    enhancedTracingMiddleware = mod.enhancedTracingMiddleware;
  });

  it('skips health and metrics paths', () => {
    const req = { path: '/health' };
    const res = { on: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('skips /metrics path', () => {
    const req = { path: '/metrics', method: 'GET' };
    const res = { on: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('sets X-Trace-Id header on response', () => {
    const req = { path: '/api/orders', method: 'GET', headers: {}, requestId: 'req-1', correlationId: 'corr-1', ip: '127.0.0.1' };
    const res = { on: vi.fn(), setHeader: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', expect.any(String));
  });

  it('attaches traceId and spanId to request', () => {
    const req = { path: '/api/test', method: 'POST', headers: {}, requestId: 'req-1', correlationId: 'corr-1', ip: '127.0.0.1' };
    const res = { on: vi.fn(), setHeader: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(req.traceId).toBeDefined();
    expect(req.spanId).toBeDefined();
  });

  it('calls next() to continue request processing', () => {
    const req = { path: '/api/test', method: 'GET', headers: {}, requestId: 'req-1', correlationId: 'corr-1', ip: '127.0.0.1' };
    const res = { on: vi.fn(), setHeader: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('attaches snapshot to request', () => {
    const req = { path: '/api/test', method: 'GET', headers: {}, requestId: 'req-1', correlationId: 'corr-1', ip: '127.0.0.1' };
    const res = { on: vi.fn(), setHeader: vi.fn() };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(req._traceSnapshot).toBeDefined();
  });

  it('registers res.on finish handler', () => {
    const req = { path: '/api/test', method: 'GET', headers: {}, requestId: 'req-1', correlationId: 'corr-1', ip: '127.0.0.1' };
    const res = { on: vi.fn(), setHeader: vi.fn(), statusCode: 200 };
    const next = vi.fn();
    enhancedTracingMiddleware(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });
});
