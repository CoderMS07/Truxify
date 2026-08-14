import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import path from 'path';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
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

vi.mock('../../src/lib/documentValidation.js', () => ({
  ALLOWED_DOCUMENT_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  validateDocumentBuffer: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/lib/malwareScanner.js', () => ({
  scanDocument: vi.fn(() => Promise.resolve({ clean: true })),
}));

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve({ data: { id: 'photo-1' }, error: null })),
    })),
  },
}));

vi.mock('../../src/controllers/maintenancePhotoController.js', () => ({
  uploadMaintenancePhotos: (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos provided.' });
    }
    return res.status(201).json({ success: true, photos: [] });
  },
}));

import maintenancePhotoRoutes from '../../src/routes/maintenancePhotoRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/maintenance', maintenancePhotoRoutes);
  return app;
}

describe('maintenancePhotoRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /maintenance/:ticketId/photos', () => {
    it('returns 201 when photos are uploaded', async () => {
      const res = await request(makeApp())
        .post('/maintenance/ticket-123/photos')
        .attach('photos', Buffer.from('fake-image'), { filename: 'photo1.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when no photos are provided', async () => {
      const res = await request(makeApp())
        .post('/maintenance/ticket-123/photos');
      expect(res.status).toBe(400);
    });
  });
});
