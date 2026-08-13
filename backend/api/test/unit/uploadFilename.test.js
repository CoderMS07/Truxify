import { describe, it, expect } from 'vitest';
import { sanitizeUploadFilename, checkContentLength } from '../../src/lib/uploadFilename.js';

describe('uploadFilename', () => {
  describe('sanitizeUploadFilename', () => {
    it('returns fallback for null input', () => {
      expect(sanitizeUploadFilename(null)).toBe('upload');
    });

    it('returns fallback for undefined input', () => {
      expect(sanitizeUploadFilename(undefined)).toBe('upload');
    });

    it('returns fallback for path traversal attempt with /', () => {
      expect(sanitizeUploadFilename('../../../etc/passwd')).toBe('upload');
    });

    it('returns fallback for path traversal attempt with backslash', () => {
      expect(sanitizeUploadFilename('..\\..\\windows\\system32')).toBe('upload');
    });

    it('strips directory components', () => {
      expect(sanitizeUploadFilename('uploads/image.png')).toBe('image.png');
    });

    it('removes control characters', () => {
      const result = sanitizeUploadFilename('file\x00name.png');
      expect(result).not.toContain('\x00');
    });

    it('rejects reserved Windows names', () => {
      expect(sanitizeUploadFilename('CON', 'fallback')).toBe('fallback');
      expect(sanitizeUploadFilename('PRN.txt', 'fallback')).toBe('fallback');
      expect(sanitizeUploadFilename('nul.pdf', 'fallback')).toBe('fallback');
    });

    it('allows normal filenames through', () => {
      expect(sanitizeUploadFilename('photo_2024.jpg')).toBe('photo_2024.jpg');
    });
  });

  describe('checkContentLength', () => {
    it('returns ok when within default limit', () => {
      const req = { headers: { 'content-length': '1000' } };
      expect(checkContentLength(req).ok).toBe(true);
    });

    it('returns ok when at exact default limit', () => {
      const req = { headers: { 'content-length': String(25 * 1024 * 1024) } };
      expect(checkContentLength(req).ok).toBe(true);
    });

    it('returns error when exceeding default limit', () => {
      const req = { headers: { 'content-length': String(30 * 1024 * 1024) } };
      const result = checkContentLength(req);
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(413);
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('returns ok when within custom max', () => {
      const req = { headers: { 'content-length': '100' } };
      expect(checkContentLength(req, 1024).ok).toBe(true);
    });

    it('returns error when exceeding custom max', () => {
      const req = { headers: { 'content-length': '1000' } };
      expect(checkContentLength(req, 512).ok).toBe(false);
    });
  });
});
