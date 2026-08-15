import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import orderRoutes from '../../src/routes/orderRoutes.js';

const { svcMock, dbMock } = vi.hoisted(() => ({
  svcMock: {
    submitRating: vi.fn(),
  },
  dbMock: { createUserClient: vi.fn(() => ({})) },
}));

vi.mock('../../src/core/container.js', () => ({
  orderRepository: {},
  orderValidationService: {},
  orderTimelineService: {},
  orderMilestoneService: {},
  orderLifecycleService: svcMock,
  deliveryVerificationService: {},
  buildDepositTx: vi.fn(),
  recordDepositTx: vi.fn(),
  submitEscrowRefund: vi.fn(),
  confirmEscrowRefund: vi.fn(),
}));

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = req.user || { id: 'u1' }; next(); },
  requireRole: () => (_req, _res, next) => next(),
}));

vi.mock('../../src/middleware/requirePolicy.js', () => ({
  requirePolicy: () => (_req, _res, next) => next(),
}));

vi.mock('../../src/config/db.js', () => ({
  createUserClient: dbMock.createUserClient,
  supabase: {},
  supabaseAdmin: {},
  mongoDb: {},
  redisClient: {},
}));

import { DomainError } from '../../src/services/order/domainError.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: 'customer-1' };
  req.token = 'test-token';
  next();
});
app.use(orderRoutes);

describe('POST /api/orders/:id/ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svcMock.submitRating.mockReset();
    dbMock.createUserClient.mockClear();
  });

  it('201: returns message and rating object', async () => {
    svcMock.submitRating.mockResolvedValue({
      message: 'Rating submitted successfully.',
      rating: { order_display_id: 'ORD-RATING', customer_id: 'customer-1', driver_id: 'driver-1', stars: 5, comment: 'Great delivery' },
    });
    const res = await request(app)
      .post('/order-rating-1/ratings')
      .send({ stars: 5, comment: 'Great delivery' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Rating submitted successfully.');
    expect(res.body.rating.stars).toBe(5);
    expect(svcMock.submitRating).toHaveBeenCalledWith('order-rating-1', 'customer-1', 5, 'Great delivery', dbMock.createUserClient('test-token'));
  });

  it('400: validation error on invalid stars', async () => {
    const res = await request(app)
      .post('/order-rating-3/ratings')
      .send({ stars: 6 });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('400: forwards DomainError when order not delivered', async () => {
    svcMock.submitRating.mockRejectedValue(new DomainError(400, { error: 'Order must be delivered before a rating can be submitted.' }));
    const res = await request(app)
      .post('/order-rating-2/ratings')
      .send({ stars: 5, comment: 'Too early' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order must be delivered before a rating can be submitted.');
  });

  it('403: forwards DomainError for non-owner', async () => {
    svcMock.submitRating.mockRejectedValue(new DomainError(403, { error: 'Access Denied: You do not own this order.' }));
    const res = await request(app)
      .post('/order-rating-4/ratings')
      .send({ stars: 5, comment: 'Not mine' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access Denied: You do not own this order.');
  });

  it('404: forwards DomainError when order missing', async () => {
    svcMock.submitRating.mockRejectedValue(new DomainError(404, { error: 'Order not found.' }));
    const res = await request(app)
      .post('/nonexistent/ratings')
      .send({ stars: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found.');
  });

  it('409: forwards DomainError on duplicate rating', async () => {
    svcMock.submitRating.mockRejectedValue(new DomainError(409, { error: 'A rating has already been submitted for this order.' }));
    const res = await request(app)
      .post('/order-rating-5/ratings')
      .send({ stars: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A rating has already been submitted for this order.');
  });

  it('500: server error on unexpected failure', async () => {
    svcMock.submitRating.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/order-rating-1/ratings')
      .send({ stars: 5 });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal Server Error.');
  });
});
