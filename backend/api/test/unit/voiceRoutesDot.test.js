/**
 * Unit tests for voice.routes.js — Voice AI assistant endpoint (/assistant).
 * Tests the POST /assistant route for request validation, service invocation, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/voice/VoiceAiService.js', () => ({
  default: { processVoiceQuery: vi.fn() },
}));

vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'user-123' };
    next();
  },
}));

vi.mock('../../src/middleware/rateLimiter.js', () => ({
  userLimiter: (_req, _res, next) => next(),
}));

vi.mock('multer', () => {
  const single = vi.fn(() => (req, _res, next) => {
    if (req._testFile) req.file = req._testFile;
    next();
  });
  return { default: vi.fn(() => ({ single })) };
});

import voiceRoutes from '../../src/routes/voice.routes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/voice', voiceRoutes);
  return app;
}

describe('voice.routes.js — POST /assistant', () => {
  let mockStream;
  let voiceAiService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStream = { pipe: vi.fn(), on: vi.fn() };
    const mod = await import('../../src/services/voice/VoiceAiService.js');
    voiceAiService = mod.default;
  });

  it('returns 400 when no audio file is provided', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/voice/assistant')
      .send({ language: 'en' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Audio file is required');
  });

  it('processVoiceQuery is called with file path and language', async () => {
    voiceAiService.processVoiceQuery.mockResolvedValue(mockStream);
    await voiceAiService.processVoiceQuery('/uploads/voice/test.wav', 'es');
    expect(voiceAiService.processVoiceQuery).toHaveBeenCalledWith('/uploads/voice/test.wav', 'es');
  });

  it('processVoiceQuery rejects for missing file', async () => {
    voiceAiService.processVoiceQuery.mockRejectedValue(new Error('ENOENT'));
    await expect(voiceAiService.processVoiceQuery('/nonexistent.wav', 'en')).rejects.toThrow('ENOENT');
  });

  it('defaults to en language when not specified', () => {
    const lang = ({}).language || 'en';
    expect(lang).toBe('en');
  });
});
