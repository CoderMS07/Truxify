import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// We need to re-import the module after each env change
let wim;

describe('WIM Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.WIM_SIGNING_SECRET;
    delete process.env.WIM_CREDENTIAL_TTL_MS;
    delete process.env.MAX_WIM_MEASUREMENT_AGE_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── getWimSigningSecret ──────────────────────────────────────────────────

  describe('getWimSigningSecret', () => {
    it('throws when WIM_SIGNING_SECRET env is not set', async () => {
      const { getWimSigningSecret } = await import('../../src/config/wim.js');
      expect(() => getWimSigningSecret()).toThrow(
        'WIM_SIGNING_SECRET environment variable is required to sign WIM bypass packets.',
      );
    });

    it('throws when secret is too short (less than 32 characters)', async () => {
      process.env.WIM_SIGNING_SECRET = 'toolooshort';
      const { getWimSigningSecret } = await import('../../src/config/wim.js');
      expect(() => getWimSigningSecret()).toThrow(
        'WIM_SIGNING_SECRET must be at least 32 characters long.',
      );
    });

    it('returns trimmed secret when secret is valid', async () => {
      process.env.WIM_SIGNING_SECRET = '  this-is-a-valid-32-char-secret!  ';
      const { getWimSigningSecret } = await import('../../src/config/wim.js');
      expect(getWimSigningSecret()).toBe('this-is-a-valid-32-char-secret!');
    });

    it('throws when secret is exactly 31 characters', async () => {
      process.env.WIM_SIGNING_SECRET = 'a'.repeat(31);
      const { getWimSigningSecret } = await import('../../src/config/wim.js');
      expect(() => getWimSigningSecret()).toThrow(
        'WIM_SIGNING_SECRET must be at least 32 characters long.',
      );
    });

    it('accepts a secret with exactly 32 characters', async () => {
      process.env.WIM_SIGNING_SECRET = 'a'.repeat(32);
      const { getWimSigningSecret } = await import('../../src/config/wim.js');
      expect(getWimSigningSecret()).toBe('a'.repeat(32));
    });
  });

  // ── hasWimSigningSecret ─────────────────────────────────────────────────

  describe('hasWimSigningSecret', () => {
    it('returns false when WIM_SIGNING_SECRET is not configured', async () => {
      const { hasWimSigningSecret } = await import('../../src/config/wim.js');
      expect(hasWimSigningSecret()).toBe(false);
    });

    it('returns true when a valid WIM signing secret is configured', async () => {
      process.env.WIM_SIGNING_SECRET = 'a'.repeat(32);
      const { hasWimSigningSecret } = await import('../../src/config/wim.js');
      expect(hasWimSigningSecret()).toBe(true);
    });

    it('returns false when secret is empty string', async () => {
      process.env.WIM_SIGNING_SECRET = '';
      const { hasWimSigningSecret } = await import('../../src/config/wim.js');
      expect(hasWimSigningSecret()).toBe(false);
    });
  });

  // ── getWimCredentialTtlMs ────────────────────────────────────────────────

  describe('getWimCredentialTtlMs', () => {
    it('returns default (15 minutes) when env is not set', async () => {
      const { getWimCredentialTtlMs } = await import('../../src/config/wim.js');
      expect(getWimCredentialTtlMs()).toBe(15 * 60 * 1000);
    });

    it('parses WIM_CREDENTIAL_TTL_MS env value correctly', async () => {
      process.env.WIM_CREDENTIAL_TTL_MS = '300000';
      const { getWimCredentialTtlMs } = await import('../../src/config/wim.js');
      expect(getWimCredentialTtlMs()).toBe(300000);
    });

    it('falls back to default for non-numeric env value', async () => {
      process.env.WIM_CREDENTIAL_TTL_MS = 'not-a-number';
      const { getWimCredentialTtlMs } = await import('../../src/config/wim.js');
      expect(getWimCredentialTtlMs()).toBe(15 * 60 * 1000);
    });

    it('falls back to default for negative values', async () => {
      process.env.WIM_CREDENTIAL_TTL_MS = '-1000';
      const { getWimCredentialTtlMs } = await import('../../src/config/wim.js');
      expect(getWimCredentialTtlMs()).toBe(15 * 60 * 1000);
    });

    it('falls back to default for zero', async () => {
      process.env.WIM_CREDENTIAL_TTL_MS = '0';
      const { getWimCredentialTtlMs } = await import('../../src/config/wim.js');
      expect(getWimCredentialTtlMs()).toBe(15 * 60 * 1000);
    });
  });

  // ── getMaxWimMeasurementAgeMs ───────────────────────────────────────────

  describe('getMaxWimMeasurementAgeMs', () => {
    it('returns default (15 minutes) when env is not set', async () => {
      const { getMaxWimMeasurementAgeMs } = await import('../../src/config/wim.js');
      expect(getMaxWimMeasurementAgeMs()).toBe(15 * 60 * 1000);
    });

    it('parses MAX_WIM_MEASUREMENT_AGE_MS env value correctly', async () => {
      process.env.MAX_WIM_MEASUREMENT_AGE_MS = '600000';
      const { getMaxWimMeasurementAgeMs } = await import('../../src/config/wim.js');
      expect(getMaxWimMeasurementAgeMs()).toBe(600000);
    });

    it('falls back to default for non-numeric env value', async () => {
      process.env.MAX_WIM_MEASUREMENT_AGE_MS = 'abc';
      const { getMaxWimMeasurementAgeMs } = await import('../../src/config/wim.js');
      expect(getMaxWimMeasurementAgeMs()).toBe(15 * 60 * 1000);
    });
  });

  // ── validateWimConfig ───────────────────────────────────────────────────

  describe('validateWimConfig', () => {
    it('throws when signing secret is not configured', async () => {
      const { validateWimConfig } = await import('../../src/config/wim.js');
      expect(() => validateWimConfig()).toThrow(
        'WIM_SIGNING_SECRET environment variable is required to sign WIM bypass packets.',
      );
    });

    it('throws when secret is too short', async () => {
      process.env.WIM_SIGNING_SECRET = 'short';
      const { validateWimConfig } = await import('../../src/config/wim.js');
      expect(() => validateWimConfig()).toThrow(
        'WIM_SIGNING_SECRET must be at least 32 characters long.',
      );
    });

    it('returns config when secret is valid and all values are positive', async () => {
      process.env.WIM_SIGNING_SECRET = 'a'.repeat(32);
      process.env.WIM_CREDENTIAL_TTL_MS = '60000';
      process.env.MAX_WIM_MEASUREMENT_AGE_MS = '60000';
      const { validateWimConfig } = await import('../../src/config/wim.js');
      const config = validateWimConfig();
      expect(config.signingSecretConfigured).toBe(true);
      expect(config.credentialTtlMs).toBe(60000);
      expect(config.maxMeasurementAgeMs).toBe(60000);
    });

    it('throws when WIM_CREDENTIAL_TTL_MS is zero', async () => {
      process.env.WIM_SIGNING_SECRET = 'a'.repeat(32);
      process.env.WIM_CREDENTIAL_TTL_MS = '0';
      const { validateWimConfig } = await import('../../src/config/wim.js');
      expect(() => validateWimConfig()).toThrow(
        'WIM_CREDENTIAL_TTL_MS and MAX_WIM_MEASUREMENT_AGE_MS must be positive integers.',
      );
    });
  });
});
