import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock config before importing router
vi.mock('../../src/config/db.js', () => ({
  supabase: null,
  supabaseAdmin: null,
  mongoDb: null,
  redisClient: null,
  firebaseAdmin: null,
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  healthLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/services/escrow.js', () => ({
  checkEscrowHealth: vi.fn().mockResolvedValue({ status: 'connected' }),
}));

vi.mock('../../src/middleware/sentry.js', () => ({
  captureDebugException: vi.fn().mockReturnValue('test-event-id'),
}));

vi.mock('../../src/core/health/index.js', () => ({
  createDefaultAggregator: vi.fn(() => ({
    aggregate: vi.fn().mockResolvedValue({ status: 'healthy', checks: [] }),
  })),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import router after mocks
const createRouter = () => import('../../src/routes/healthRoutes.js');

describe('healthRoutes', () => {
  let app, router;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const mod = await createRouter();
    router = mod.default;
    app.use('/api/health', router);
  });

  describe('GET /api/health/live', () => {
    it('returns 200 with status ok', async () => {
      const res = await import('supertest').then(m => m.default(app).get('/api/health/live'));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('GET /api/health', () => {
    it('returns 200 when services are configured', async () => {
      const res = await import('supertest').then(m => m.default(app).get('/api/health'));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 when services are configured', async () => {
      const res = await import('supertest').then(m => m.default(app).get('/api/health/ready'));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('GET /api/health/full', () => {
    it('returns 200 when aggregator is healthy', async () => {
      const res = await import('supertest').then(m => m.default(app).get('/api/health/full'));
      expect(res.status).toBe(200);
    });

    it('returns 503 when aggregator is unhealthy', async () => {
      const { createDefaultAggregator } = await import('../../src/core/health/index.js');
      const mockAgg = { aggregate: vi.fn().mockResolvedValue({ status: 'unhealthy', checks: [] }) };
      createDefaultAggregator.mockReturnValue(mockAgg);

      // Need to re-import router to pick up new mock
      const mod2 = await import('../../src/routes/healthRoutes.js');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api/health', mod2.default);

      const res = await import('supertest').then(m => m.default(app2).get('/api/health/full'));
      expect(res.status).toBe(503);
    });
  });
});
