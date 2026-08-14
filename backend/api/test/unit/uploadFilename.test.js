import { describe, it, expect } from 'vitest';
import { sanitizeUploadFilename, checkContentLength } from '../../src/lib/uploadFilename.js';

describe('uploadFilename', () => {
  describe('sanitizeUploadFilename', () => {
    it('returns fallback for non-string input', () => {
      expect(sanitizeUploadFilename(null)).toBe('upload');
      expect(sanitizeUploadFilename(undefined)).toBe('upload');
      expect(sanitizeUploadFilename(123)).toBe('upload');
      expect(sanitizeUploadFilename('')).toBe('upload');
    });

    it('returns custom fallback when provided', () => {
      expect(sanitizeUploadFilename(null, 'myfile')).toBe('myfile');
      expect(sanitizeUploadFilename('', 'custom')).toBe('custom');
    });

    it('strips directory traversal paths', () => {
      expect(sanitizeUploadFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeUploadFilename('C:\\Windows\\System32\\config')).toBe('config');
      expect(sanitizeUploadFilename('/etc/shadow')).toBe('shadow');
    });

    it('strips path traversal sequences', () => {
      expect(sanitizeUploadFilename('..%2F..%2Fetc/passwd')).toBe('passwd');
      expect(sanitizeUploadFilename('foo/../../../bar')).toBe('bar');
    });

    it('removes control characters', () => {
      expect(sanitizeUploadFilename('file\x00name.txt')).toBe('filename.txt');
      expect(sanitizeUploadFilename('file\x1fname.txt')).toBe('filename.txt');
    });

    it('collapses multiple dots and removes leading dots', () => {
      expect(sanitizeUploadFilename('...hidden')).toBe('hidden');
      expect(sanitizeUploadFilename('file...name')).toBe('file.name');
    });

    it('rejects Windows reserved names', () => {
      expect(sanitizeUploadFilename('CON')).toBe('upload');
      expect(sanitizeUploadFilename('PRN')).toBe('upload');
      expect(sanitizeUploadFilename('AUX')).toBe('upload');
      expect(sanitizeUploadFilename('NUL')).toBe('upload');
      expect(sanitizeUploadFilename('com1')).toBe('upload');
      expect(sanitizeUploadFilename('LPT9')).toBe('upload');
    });

    it('preserves valid filenames', () => {
      expect(sanitizeUploadFilename('photo.jpg')).toBe('photo.jpg');
      expect(sanitizeUploadFilename('document_2024.pdf')).toBe('document_2024.pdf');
      expect(sanitizeUploadFilename('my-photo.PNG')).toBe('my-photo.PNG');
    });

    it('truncates long filenames to MAX_FILENAME_LENGTH', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const result = sanitizeUploadFilename(longName);
      expect(result.length).toBeLessThanOrEqual(120);
      expect(result.endsWith('.jpg')).toBe(true);
    });
  });

  describe('checkContentLength', () => {
    it('returns ok for valid content length', () => {
      const req = { headers: { 'content-length': '1024' } };
      expect(checkContentLength(req)).toEqual({ ok: true, length: 1024 });
    });

    it('returns error for missing content-length', () => {
      const req = { headers: {} };
      const result = checkContentLength(req);
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(411);
    });

    it('returns error for non-numeric content-length', () => {
      const req = { headers: { 'content-length': 'abc' } };
      const result = checkContentLength(req);
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(400);
    });

    it('returns error for content exceeding maxBytes', () => {
      const req = { headers: { 'content-length': String(30 * 1024 * 1024) } };
      const result = checkContentLength(req, 25 * 1024 * 1024);
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(413);
    });
  });
});
