import { describe, it, expect } from 'vitest';
import {
  sanitizeUploadFilename,
  checkContentLength,
} from '../../src/lib/uploadFilename.js';

describe('sanitizeUploadFilename', () => {
  it('keeps a safe filename intact', () => {
    expect(sanitizeUploadFilename('document.pdf')).toBe('document.pdf');
    expect(sanitizeUploadFilename('my-file_1.txt')).toBe('my-file_1.txt');
  });

  it('strips directory components (POSIX and Windows separators)', () => {
    expect(sanitizeUploadFilename('a/b/c.txt')).toBe('c.txt');
    expect(sanitizeUploadFilename('x\\y\\z.png')).toBe('z.png');
    expect(sanitizeUploadFilename('foo/../bar.txt')).toBe('bar.txt');
  });

  it('prevents path traversal', () => {
    const result = sanitizeUploadFilename('../../../../etc/passwd');
    expect(result).not.toContain('/');
    expect(result).not.toContain('..');
  });

  it('removes control characters and NUL bytes', () => {
    expect(sanitizeUploadFilename('fi\x00le.txt')).toBe('file.txt');
    expect(sanitizeUploadFilename('a\x01b.txt')).toBe('a_b.txt');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeUploadFilename('a:b*c?.jpg')).toBe('a_b_c_.jpg');
  });

  it('falls back for Windows reserved names', () => {
    expect(sanitizeUploadFilename('con')).toBe('upload');
    expect(sanitizeUploadFilename('CON.txt')).toBe('upload');
    expect(sanitizeUploadFilename('com1')).toBe('upload');
    expect(sanitizeUploadFilename('Prn.pdf')).toBe('upload');
  });

  it('truncates overly long filenames', () => {
    const longName = 'a'.repeat(200) + '.txt';
    const result = sanitizeUploadFilename(longName);
    expect(result.length).toBeLessThanOrEqual(120);
  });

  it('uses the provided fallback for unusable input', () => {
    expect(sanitizeUploadFilename('')).toBe('upload');
    expect(sanitizeUploadFilename(null)).toBe('upload');
    expect(sanitizeUploadFilename(undefined)).toBe('upload');
    expect(sanitizeUploadFilename(123)).toBe('upload');
    expect(sanitizeUploadFilename('', 'custom-fallback')).toBe('custom-fallback');
  });
});

describe('checkContentLength', () => {
  const makeReq = (len) => ({
    headers: len === undefined ? {} : { 'content-length': String(len) },
  });

  it('accepts a request within the limit', () => {
    const res = checkContentLength(makeReq(100));
    expect(res.ok).toBe(true);
    expect(res.length).toBe(100);
  });

  it('accepts a request at the default limit', () => {
    const limit = 25 * 1024 * 1024;
    const res = checkContentLength(makeReq(limit));
    expect(res.ok).toBe(true);
  });

  it('rejects a request exceeding the default limit', () => {
    const res = checkContentLength(makeReq(25 * 1024 * 1024 + 1));
    expect(res.ok).toBe(false);
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error.status).toBe(413);
  });

  it('treats a missing content-length header as zero', () => {
    const res = checkContentLength(makeReq(undefined));
    expect(res.ok).toBe(true);
    expect(res.length).toBe(0);
  });

  it('honours a custom max byte limit', () => {
    const res = checkContentLength(makeReq(5000), 1024);
    expect(res.ok).toBe(false);
    const okRes = checkContentLength(makeReq(500), 1024);
    expect(okRes.ok).toBe(true);
  });
});
