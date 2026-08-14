import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('middleware/securityHeaders', () => {
  const originalEnv = process.env;
  const mockReq = (overrides = {}) => ({
    secure: false,
    headers: {},
    ...overrides,
  });
  const mockRes = () => {
    const headers = {};
    return {
      headers,
      getHeader: (name) => headers[name],
      setHeader: (name, value) => {
        headers[name] = value;
      },
    };
  };
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockNext.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets X-Content-Type-Options header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets X-Frame-Options to DENY', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('X-Frame-Options')).toBe('DENY');
  });

  it('sets X-XSS-Protection header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('sets Referrer-Policy header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('Permissions-Policy')).toBe('geolocation=(self), camera=(self), microphone=(self)');
  });

  it('sets Cross-Origin-Resource-Policy header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('sets X-Content-Security-Policy header', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('X-Content-Security-Policy')).toBe("default-src 'self'");
  });

  it('sets HSTS header when req.secure is true', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq({ secure: true });
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    const hsts = res.getHeader('Strict-Transport-Security');
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
  });

  it('sets HSTS header when x-forwarded-proto is https', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq({ headers: { 'x-forwarded-proto': 'https' } });
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    const hsts = res.getHeader('Strict-Transport-Security');
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
  });

  it('does not set HSTS header when not over HTTPS', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq({ secure: false, headers: {} });
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('Strict-Transport-Security')).toBeUndefined();
  });

  it('does not override existing headers', async () => {
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq();
    const res = mockRes();
    res.setHeader('X-Content-Type-Options', 'already-set');
    securityHeaders(req, res, mockNext);
    expect(res.getHeader('X-Content-Type-Options')).toBe('already-set');
  });

  it('respects SECURE_HSTS_MAX_AGE env var', async () => {
    process.env.SECURE_HSTS_MAX_AGE = '63072000';
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq({ secure: true });
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    const hsts = res.getHeader('Strict-Transport-Security');
    expect(hsts).toContain('max-age=63072000');
  });

  it('falls back to default HSTS max-age for invalid env value', async () => {
    process.env.SECURE_HSTS_MAX_AGE = '-1';
    const { default: securityHeaders } = await import('../../src/middleware/securityHeaders.js');
    const req = mockReq({ secure: true });
    const res = mockRes();
    securityHeaders(req, res, mockNext);
    const hsts = res.getHeader('Strict-Transport-Security');
    expect(hsts).toContain('max-age=31536000'); // default
  });

  describe('setHstsHeader', () => {
    it('sets preload HSTS header', async () => {
      const { setHstsHeader } = await import('../../src/middleware/securityHeaders.js');
      const res = mockRes();
      const result = setHstsHeader(res);
      expect(result).toBe(true);
      expect(res.getHeader('Strict-Transport-Security')).toContain('max-age=63072000');
      expect(res.getHeader('Strict-Transport-Security')).toContain('preload');
    });

    it('returns false when HSTS header already set', async () => {
      const { setHstsHeader } = await import('../../src/middleware/securityHeaders.js');
      const res = mockRes();
      res.setHeader('Strict-Transport-Security', 'already-set');
      const result = setHstsHeader(res);
      expect(result).toBe(false);
    });
  });
});
