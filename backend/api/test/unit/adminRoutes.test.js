import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

vi.mock('../../src/config/db.js', () => ({
  supabase: null,
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ data: [], error: null }),
          count: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'admin-123', role: 'admin' };
    next();
  },
}));

vi.mock('../../src/middleware/requirePolicy.js', () => ({
  requirePolicy: () => (req, res, next) => next(),
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (req, res, next) => next(),
}));

vi.mock('../../src/middleware/auditLog.js', () => ({
  auditLog: () => (req, res, next) => next(),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const createRouter = () => import('../../src/routes/adminRoutes.js');

describe('adminRoutes', () => {
  let app, router;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const mod = await createRouter();
    router = mod.default;
    app.use('/api/v1/admin', router);
  });

  describe('GET /api/v1/admin/dashboard', () => {
    it('returns 200 with stats', async () => {
      const res = await import('supertest').then(m => m.default(app).get('/api/v1/admin/dashboard'));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('active_drivers');
      expect(res.body).toHaveProperty('pending_orders');
    });
  });

  describe('auth middleware', () => {
    it('rejects unauthenticated requests (401)', async () => {
      const { authenticate } = await import('../../src/middleware/auth.js');
      // Override mock to simulate missing auth
      vi.doMock('../../src/middleware/auth.js', () => ({
        authenticate: (req, res) => res.status(401).json({ error: 'Unauthorized' }),
      }));

      const mod2 = await import('../../src/routes/adminRoutes.js');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api/v1/admin', mod2.default);

      const res = await import('supertest').then(m => m.default(app2).get('/api/v1/admin/dashboard'));
      expect(res.status).toBe(401);
    });
  });
});
