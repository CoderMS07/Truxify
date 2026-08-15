import { describe, it, expect, vi, beforeEach } from 'vitest';

const { TrackingTokenService } = await import('../../../../src/services/trackingTokenService.js');

// All methods return the chain object except the terminal call which returns a Promise.
function makeChain(terminalFn) {
  const chain = {
    from: () => chain,
    insert: () => chain,
    select: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    lt: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: terminalFn,
    single: terminalFn,
  };
  return chain;
}

describe('TrackingTokenService', () => {
  describe('generateRawToken', () => {
    it('returns a base64url string of correct length', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const token = service.generateRawToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(43); // 32 bytes → 43 base64url chars
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique tokens each call', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const tokens = new Set([service.generateRawToken(), service.generateRawToken()]);
      expect(tokens.size).toBe(2);
    });
  });

  describe('hashToken', () => {
    it('returns a 64-character hex string (SHA-256)', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const hash = service.hashToken('test-token-12345');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns the same hash for the same input', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      expect(service.hashToken('consistent-input')).toBe(service.hashToken('consistent-input'));
    });

    it('returns different hashes for different inputs', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      expect(service.hashToken('token-a')).not.toBe(service.hashToken('token-b'));
    });
  });

  describe('getExpiryDate', () => {
    it('returns an ISO date string roughly 7 days in the future', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const before = new Date();
      const expiry = new Date(service.getExpiryDate());
      expect(expiry.getTime() - before.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(expiry.getTime() - before.getTime()).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    });

    it('returns a valid ISO string', () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      expect(service.getExpiryDate()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('createToken', () => {
    it('throws when orderDisplayId is missing', async () => {
      const chain = makeChain(() => ({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      await expect(service.createToken({})).rejects.toThrow('orderDisplayId is required');
    });

    it('inserts token record and returns raw token alongside record data', async () => {
      const dbRow = {
        id: 'token-uuid-123',
        order_display_id: 'ORD-001',
        expires_at: '2025-08-01T00:00:00.000Z',
        created_at: '2025-07-25T00:00:00.000Z',
      };
      const chain = makeChain(() => Promise.resolve({ data: dbRow, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });

      const result = await service.createToken({ orderDisplayId: 'ORD-001', createdBy: 'user-1' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('id', 'token-uuid-123');
      expect(result.order_display_id).toBe('ORD-001');
    });

    it('throws when database insert fails', async () => {
      const chain = makeChain(() => Promise.resolve({ data: null, error: { message: 'insert failed' } }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      await expect(service.createToken({ orderDisplayId: 'ORD-001' })).rejects.toThrow('Failed to create tracking token');
    });
  });

  describe('validateToken', () => {
    it('returns validation_error when database query fails', async () => {
      const chain = makeChain(() => Promise.resolve({ data: null, error: { message: 'db error' } }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const result = await service.validateToken('some-raw-token');
      expect(result).toEqual({ valid: false, reason: 'validation_error' });
    });

    it('returns not_found when token hash is not in database', async () => {
      const chain = makeChain(() => Promise.resolve({ data: null, error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const result = await service.validateToken('unknown-token');
      expect(result).toEqual({ valid: false, reason: 'not_found' });
    });

    it('returns revoked when token is revoked', async () => {
      const chain = makeChain(() =>
        Promise.resolve({ data: { id: 'tok-1', token_hash: 'abc', revoked: true, expires_at: '2030-01-01' }, error: null })
      );
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const result = await service.validateToken('raw-token');
      expect(result).toEqual({ valid: false, reason: 'revoked' });
    });

    it('returns expired when token expiry date has passed', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const chain = makeChain(() =>
        Promise.resolve({
          data: { id: 'tok-1', token_hash: 'abc', revoked: false, expires_at: past.toISOString() },
          error: null,
        })
      );
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const result = await service.validateToken('raw-token');
      expect(result).toEqual({ valid: false, reason: 'expired', tokenId: 'tok-1' });
    });

    it('returns valid with orderDisplayId when token is active', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const chain = makeChain(() =>
        Promise.resolve({
          data: { id: 'tok-active', token_hash: 'abc', revoked: false, expires_at: future.toISOString(), order_display_id: 'ORD-999' },
          error: null,
        })
      );
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      const result = await service.validateToken('active-raw-token');
      expect(result).toEqual({ valid: true, orderDisplayId: 'ORD-999', tokenId: 'tok-active' });
    });
  });

  describe('purgeExpiredTokens', () => {
    it('returns 0 when database delete fails', async () => {
      const chain = makeChain(() => Promise.resolve({ data: null, error: { message: 'delete failed' } }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      expect(await service.purgeExpiredTokens()).toBe(0);
    });
  });

  describe('getActiveTokensForOrder', () => {
    it('returns empty array when no active tokens found', async () => {
      const chain = makeChain(() => Promise.resolve({ data: [], error: null }));
      const service = new TrackingTokenService({ supabase: chain, supabaseAdmin: chain, logger: { error: vi.fn() } });
      expect(await service.getActiveTokensForOrder('ORD-001')).toEqual([]);
    });
  });
});
