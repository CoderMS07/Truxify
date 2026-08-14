import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1', role: 'driver' }; next(); },
  requireRole: (roles) => (_req, _res, next) => next(),
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
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/order/crossDockService.js', () => ({
  findHandoffCandidates: vi.fn(() => Promise.resolve({ candidates: [] })),
  createTransferRequest: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'pending' })),
  acceptTransferRequest: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'accepted' })),
  declineTransferRequest: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'declined' })),
  cancelTransferRequest: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'cancelled' })),
  verifyHandoff: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'verified' })),
  getTransfer: vi.fn(() => Promise.resolve({ id: 'transfer-1', status: 'pending' })),
  listTransfers: vi.fn(() => Promise.resolve({ transfers: [] })),
}));

vi.mock('../../src/services/order/domainError.js', () => ({
  DomainError: class DomainError extends Error {
    constructor(message, status = 400, payload = {}) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
}));

import crossDockRoutes from '../../src/routes/crossDockRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/cross-dock', crossDockRoutes);
  return app;
}

describe('crossDockRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /cross-dock/candidates', () => {
    it('returns 400 when orderId is missing', async () => {
      const res = await request(makeApp()).get('/cross-dock/candidates');
      expect(res.status).toBe(400);
    });

    it('returns candidates when orderId is provided', async () => {
      const { findHandoffCandidates } = await import('../../src/services/order/crossDockService.js');
      findHandoffCandidates.mockResolvedValueOnce({ candidates: [{ id: 'c1' }] });
      const res = await request(makeApp())
        .get('/cross-dock/candidates')
        .query({ orderId: '550e8400-e29b-41d4-a716-446655440000' });
      expect(res.status).toBe(200);
      expect(res.body.candidates).toBeDefined();
    });
  });

  describe('POST /cross-dock', () => {
    it('returns 400 when orderId is missing', async () => {
      const res = await request(makeApp())
        .post('/cross-dock?orderId=')
        .send({ to_driver_id: '550e8400-e29b-41d4-a716-446655440001', cross_dock_lat: 40.7, cross_dock_lng: -74.0 });
      expect(res.status).toBe(400);
    });

    it('returns 201 when transfer is created', async () => {
      const { createTransferRequest } = await import('../../src/services/order/crossDockService.js');
      createTransferRequest.mockResolvedValueOnce({ id: 'transfer-1', status: 'pending' });
      const res = await request(makeApp())
        .post('/cross-dock?orderId=550e8400-e29b-41d4-a716-446655440000')
        .send({ to_driver_id: '550e8400-e29b-41d4-a716-446655440001', cross_dock_lat: 40.7, cross_dock_lng: -74.0 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('transfer-1');
    });
  });

  describe('POST /cross-dock/:id/accept', () => {
    it('returns 200 when transfer is accepted', async () => {
      const { acceptTransferRequest } = await import('../../src/services/order/crossDockService.js');
      acceptTransferRequest.mockResolvedValueOnce({ id: 'transfer-1', status: 'accepted' });
      const res = await request(makeApp())
        .post('/cross-dock/550e8400-e29b-41d4-a716-446655440099/accept');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /cross-dock/:id/decline', () => {
    it('returns 200 when transfer is declined', async () => {
      const { declineTransferRequest } = await import('../../src/services/order/crossDockService.js');
      declineTransferRequest.mockResolvedValueOnce({ id: 'transfer-1', status: 'declined' });
      const res = await request(makeApp())
        .post('/cross-dock/550e8400-e29b-41d4-a716-446655440099/decline');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /cross-dock/:id/verify', () => {
    it('returns 200 when handoff is verified', async () => {
      const { verifyHandoff } = await import('../../src/services/order/crossDockService.js');
      verifyHandoff.mockResolvedValueOnce({ id: 'transfer-1', status: 'verified' });
      const res = await request(makeApp())
        .post('/cross-dock/550e8400-e29b-41d4-a716-446655440099/verify')
        .send({ otp: '123456' });
      expect(res.status).toBe(200);
    });
  });
});
