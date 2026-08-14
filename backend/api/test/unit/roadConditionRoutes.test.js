import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (_req, _res, next) => next(),
  createStore: vi.fn(() => ({ increment: vi.fn(), decrement: vi.fn(), resetKey: vi.fn() })),
  safeIpKeyGenerator: vi.fn(() => 'test-ip'),
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      function makeQueryBuilder(data, error = null) {
        return {
          select: vi.fn(() => makeQueryBuilder(data, error)),
          insert: vi.fn(() => Promise.resolve({ data: { id: 'grip-1' }, error: null })),
          gte: vi.fn(() => makeQueryBuilder(data, error)),
          lte: vi.fn(() => makeQueryBuilder(data, error)),
          order: vi.fn(() => makeQueryBuilder(data, error)),
          limit: vi.fn(() => Promise.resolve({ data, error })),
          single: vi.fn(() => Promise.resolve({ data: data?.[0] || null, error })),
        };
      }
      return makeQueryBuilder([{ id: 'grip-1', grip_index: 0.8, latitude: 40.7128 }]);
    }),
  },
}));

import roadConditionRoutes from '../../src/routes/roadConditionRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/road-conditions', roadConditionRoutes);
  return app;
}

describe('roadConditionRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /road-conditions/grip', () => {
    it('returns 201 when grip data is reported successfully', async () => {
      const res = await request(makeApp())
        .post('/road-conditions/grip')
        .send({ latitude: 40.7128, longitude: -74.0060, grip_index: 0.85, slip_events_count: 0 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when latitude is missing', async () => {
      const res = await request(makeApp())
        .post('/road-conditions/grip')
        .send({ longitude: -74.0060, grip_index: 0.85 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when grip_index is out of range', async () => {
      const res = await request(makeApp())
        .post('/road-conditions/grip')
        .send({ latitude: 40.7128, longitude: -74.0060, grip_index: 15 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /road-conditions/grip/nearby', () => {
    it('returns 200 with grip data for valid coordinates', async () => {
      const res = await request(makeApp())
        .get('/road-conditions/grip/nearby')
        .query({ lat: '40.7128', lng: '-74.0060' });
      expect(res.status).toBe(200);
      expect(res.body.data !== undefined).toBe(true);
    });

    it('returns 400 when lat is missing', async () => {
      const res = await request(makeApp())
        .get('/road-conditions/grip/nearby')
        .query({ lng: '-74.0060' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when lng is missing', async () => {
      const res = await request(makeApp())
        .get('/road-conditions/grip/nearby')
        .query({ lat: '40.7128' });
      expect(res.status).toBe(400);
    });
  });
});
