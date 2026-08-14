import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/telemetry/SpanFactory.js', () => {
  const mockSpan = { end: vi.fn(), setStatus: vi.fn() };
  return {
    default: {
      startWorkerSpan: vi.fn(() => mockSpan),
      withWorkerSpan: vi.fn((name, fn) => fn()),
      recordError: vi.fn(),
    },
    STANDARD_ATTRIBUTES: {},
  };
});

vi.mock('../../src/core/telemetry/ContextPropagator.js', () => ({
  ContextPropagator: {
    snapshot: vi.fn(() => ({ traceId: 'parent-trace' })),
    restore: vi.fn((snap, fn) => fn()),
  },
}));

vi.mock('@opentelemetry/api', () => ({
  context: {
    with: vi.fn((ctx, fn) => fn()),
    active: vi.fn(),
  },
  trace: {
    setSpan: vi.fn(),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('workerTracer', () => {
  let WorkerTracer;
  let mockSpan;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/core/telemetry/WorkerTracer.js');
    WorkerTracer = mod.WorkerTracer;
    const spanFactory = await import('../../src/core/telemetry/SpanFactory.js');
    mockSpan = { end: vi.fn(), setStatus: vi.fn() };
    spanFactory.default.startWorkerSpan.mockReturnValue(mockSpan);
  });

  describe('createTracedWorker', () => {
    it('creates a traced worker function', () => {
      const handler = vi.fn().mockResolvedValue('result');
      const traced = WorkerTracer.createTracedWorker('test-worker', handler);
      expect(typeof traced).toBe('function');
    });

    it('propagates context snapshot to worker handler', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const traced = WorkerTracer.createTracedWorker('test-worker', handler);
      await traced('arg1');
      expect(handler).toHaveBeenCalledWith('arg1');
    });

    it('ends span on handler success', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const traced = WorkerTracer.createTracedWorker('test-worker', handler);
      await traced();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends span on handler error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('worker failed'));
      const traced = WorkerTracer.createTracedWorker('test-worker', handler);
      await expect(traced()).rejects.toThrow('worker failed');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('gracefully handles missing trace context', async () => {
      const ContextPropagator = (await import('../../src/core/telemetry/ContextPropagator.js')).ContextPropagator;
      ContextPropagator.snapshot.mockReturnValueOnce(undefined);
      const handler = vi.fn().mockResolvedValue('result');
      const traced = WorkerTracer.createTracedWorker('test-worker', handler);
      await traced();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('executeWithTraceContext', () => {
    it('restores trace context and executes function', async () => {
      const fn = vi.fn().mockResolvedValue('done');
      const result = await WorkerTracer.executeWithTraceContext({ traceId: 'test' }, fn);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('wrapCronJob', () => {
    it('returns an async function', () => {
      const cronHandler = vi.fn().mockResolvedValue(undefined);
      const wrapped = WorkerTracer.wrapCronJob('daily-job', cronHandler, { schedule: '0 0 * * *' });
      expect(typeof wrapped).toBe('function');
    });
  });

  describe('wrapIntervalWorker', () => {
    it('returns an async function', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = WorkerTracer.wrapIntervalWorker('interval-job', handler, { intervalMs: 60000 });
      expect(typeof wrapped).toBe('function');
    });
  });
});
