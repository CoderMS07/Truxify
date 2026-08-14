import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (_req, _res, next) => next(),
  createStore: vi.fn(() => ({ increment: vi.fn(), decrement: vi.fn(), resetKey: vi.fn() })),
}));

vi.mock('../../src/middleware/requirePolicy.js', () => ({
  requirePolicy: () => (_req, _res, next) => next(),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/middleware/auditLog.js', () => ({
  default: { error: vi.fn() },
  auditLog: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock('../../src/services/sharding/ShardManager.js', () => ({
  default: {
    getDashboardStats: vi.fn(() => Promise.resolve({ total_orders: 100, active_drivers: 50 })),
    healthCheck: vi.fn(() => Promise.resolve({ status: 'healthy' })),
  },
}));

import adminRoutes from '../../src/routes/adminRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRoutes);
  return app;
}

describe('adminRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/dashboard', () => {
    it('returns 200 with dashboard stats on success', async () => {
      const res = await request(makeApp()).get('/admin/admin/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('returns 500 when shardManager throws', async () => {
      const { default: ShardManager } = await import('../../src/services/sharding/ShardManager.js');
      ShardManager.getDashboardStats.mockRejectedValueOnce(new Error('db unavailable'));
      const res = await request(makeApp()).get('/admin/admin/dashboard');
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});
