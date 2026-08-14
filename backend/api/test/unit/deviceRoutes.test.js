import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (_req, _res, next) => next(),
  createStore: vi.fn(() => ({ increment: vi.fn(), decrement: vi.fn(), resetKey: vi.fn() })),
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ data: { id: 'device-1' }, error: null })),
      delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
      select: vi.fn(() => Promise.resolve({ data: [{ platform: 'ios' }, { platform: 'android' }], error: null })),
    })),
  },
}));

import deviceRoutes from '../../src/routes/deviceRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/devices', deviceRoutes);
  return app;
}

describe('deviceRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /devices/register', () => {
    it('returns 201 when device is registered', async () => {
      const res = await request(makeApp())
        .post('/devices/devices/register')
        .send({ token: 'fcm-token-123', platform: 'ios' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when token is missing', async () => {
      const res = await request(makeApp())
        .post('/devices/devices/register')
        .send({ platform: 'ios' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /devices/unregister', () => {
    it('returns 200 when device is unregistered', async () => {
      const res = await request(makeApp())
        .delete('/devices/devices/unregister')
        .send({ token: 'fcm-token-123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /devices/platforms', () => {
    it('returns 200 with platform list', async () => {
      const res = await request(makeApp()).get('/devices/devices/platforms');
      expect(res.status).toBe(200);
      expect(res.body.platforms).toBeDefined();
    });
  });
});
