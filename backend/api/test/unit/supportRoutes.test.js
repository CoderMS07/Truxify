import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1', role: 'driver' }; next(); },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (_req, _res, next) => next(),
  createStore: vi.fn(() => ({ increment: vi.fn(), decrement: vi.fn(), resetKey: vi.fn() })),
}));

vi.mock('../../src/middleware/requirePolicy.js', () => ({
  requirePolicy: () => (_req, _res, next) => next(),
}));

vi.mock('../../src/middleware/validate.js', () => ({
  validateBody: () => (req, _res, next) => { req.body = req.body || {}; next(); },
  validateParams: () => (req, _res, next) => { req.params = req.params || {}; next(); },
  validateQuery: () => (req, _res, next) => { req.query = req.query || {}; next(); },
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/middleware/auditLog.js', () => ({
  default: { error: vi.fn() },
  auditLog: vi.fn(() => (_req, _res, next) => next()),
  auditAdminAction: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: { id: 'ticket-1' }, error: null })),
      update: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
  },
  createUserClient: vi.fn(() => {
    function queryBuilder(data, error = null) {
      return {
        data,
        error,
        eq: vi.fn(() => queryBuilder(data, error)),
        order: vi.fn(() => queryBuilder(data, error)),
        range: vi.fn(() => Promise.resolve({ data, error, count: data?.length || 0 })),
        single: vi.fn(() => Promise.resolve({ data: data?.[0] || null, error })),
      };
    }
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => queryBuilder([{ id: 'ticket-1', subject: 'Test', status: 'open' }])),
        insert: vi.fn(() => ({
          select: vi.fn(() => queryBuilder([{ id: 'ticket-1', subject: 'Test', status: 'open' }])),
        })),
      })),
    };
  }),
}));

import supportRoutes from '../../src/routes/supportRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/support', supportRoutes);
  return app;
}

describe('supportRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /support/categories', () => {
    it('returns support categories', async () => {
      const res = await request(makeApp()).get('/support/categories');
      expect(res.status).toBe(200);
      expect(res.body.categories).toBeDefined();
      expect(Array.isArray(res.body.categories)).toBe(true);
    });
  });

  describe('POST /support/tickets', () => {
    it('creates a ticket with valid payload', async () => {
      const res = await request(makeApp())
        .post('/support/tickets')
        .send({ subject: 'Billing issue', category: 'billing', description: 'Charge discrepancy' });
      expect(res.status).toBe(201);
      expect(res.body.ticket).toBeDefined();
    });

    it('returns 400 when subject is missing', async () => {
      const res = await request(makeApp())
        .post('/support/tickets')
        .send({ category: 'billing' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when category is missing', async () => {
      const res = await request(makeApp())
        .post('/support/tickets')
        .send({ subject: 'Billing issue' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /support/tickets', () => {
    it('returns ticket list', async () => {
      const res = await request(makeApp()).get('/support/tickets');
      expect(res.status).toBe(200);
      expect(res.body.tickets).toBeDefined();
      expect(Array.isArray(res.body.tickets)).toBe(true);
    });
  });
});
