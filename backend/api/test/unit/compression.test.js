import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('compression config', () => {
  let shouldCompress;
  let COMPRESSION_THRESHOLD_BYTES;
  let COMPRESSION_LEVEL;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Clear env vars before importing
    delete process.env.COMPRESSION_THRESHOLD_BYTES;
    delete process.env.COMPRESSION_LEVEL;
    const mod = await import('../../src/config/compression.js');
    shouldCompress = mod.shouldCompress;
    COMPRESSION_THRESHOLD_BYTES = mod.COMPRESSION_THRESHOLD_BYTES;
    COMPRESSION_LEVEL = mod.COMPRESSION_LEVEL;
  });

  // ── shouldCompress ────────────────────────────────────────────────────────

  describe('shouldCompress', () => {
    it('returns false when x-no-compression header is set', () => {
      const req = { headers: { 'x-no-compression': 'true' } };
      const res = { getHeader: vi.fn(() => 'application/json') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false when x-no-compression header is empty string', () => {
      const req = { headers: { 'x-no-compression': '' } };
      const res = { getHeader: vi.fn(() => 'application/json') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for image content types', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'image/png') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for image/jpeg', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'image/jpeg') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for video content types', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'video/mp4') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for audio content types', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'audio/mpeg') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for application/zip', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'application/zip') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for application/gzip', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'application/gzip') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for application/x-gzip', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'application/x-gzip') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for application/pdf', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'application/pdf') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for application/octet-stream', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'application/octet-stream') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false for text/event-stream (SSE)', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'text/event-stream') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('returns false when Content-Type is not set and compression filter returns false', async () => {
      // When Content-Type is empty, falls through to compression.filter which returns false
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => undefined) };
      // compression.filter is not mocked here, so it will use the actual filter
      // which should return false when no Accept-Encoding is present
      const result = shouldCompress(req, res);
      // The actual compression.filter returns false when no encoding is accepted
      expect(result).toBe(false);
    });

    it('handles uppercase Content-Type header', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'IMAGE/PNG') };
      expect(shouldCompress(req, res)).toBe(false);
    });

    it('handles Content-Type with charset suffix', () => {
      const req = { headers: {} };
      const res = { getHeader: vi.fn(() => 'text/html; charset=utf-8') };
      // text/html is not in the already-compressed list, so falls through
      const result = shouldCompress(req, res);
      expect(typeof result).toBe('boolean');
    });

    it('handles missing getHeader', () => {
      const req = { headers: {} };
      const res = {};
      // Should not throw
      const result = shouldCompress(req, res);
      expect(typeof result).toBe('boolean');
    });
  });

  // ── env var parsing ───────────────────────────────────────────────────────

  describe('env var defaults', () => {
    it('COMPRESSION_THRESHOLD_BYTES defaults to 1024', () => {
      expect(COMPRESSION_THRESHOLD_BYTES).toBe(1024);
    });

    it('COMPRESSION_LEVEL defaults to 6', () => {
      expect(COMPRESSION_LEVEL).toBe(6);
    });
  });
});
