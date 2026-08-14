import { describe, it, expect, vi, beforeEach } from 'vitest';
import KeyRotationService from '../../src/services/security/keyRotationService.js';

vi.mock('../../src/config/db.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }) })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
        })),
      })),
    })),
  },
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));
vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: async (name, fn) => fn(),
}));

describe('keyRotationService', () => {
  let service;
  let mockKeyManagementService;

  const validPrivateKey = '0x' + 'a'.repeat(64);
  const validWallet = '0x' + 'b'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
    mockKeyManagementService = {
      validatePrivateKey: vi.fn((key) => key && key.startsWith('0x') && key.length === 66),
      retrieveEncryptedKey: vi.fn().mockResolvedValue(null),
      archiveKey: vi.fn().mockResolvedValue(undefined),
      generateMasterSecret: vi.fn().mockReturnValue('master-secret'),
      encryptPrivateKey: vi.fn().mockResolvedValue('encrypted-key'),
      storeEncryptedKey: vi.fn().mockResolvedValue('key-id-123'),
    };
    service = new KeyRotationService({ keyManagementService: mockKeyManagementService });
  });

  describe('initiateKeyRotation', () => {
    it('throws when rotation is already in progress', async () => {
      // Start one rotation
      const p1 = service.initiateKeyRotation('user-1', validWallet, validPrivateKey, validPrivateKey, 'routine');
      await vi.waitFor(() => expect(service.rotationLocks.has('user-1:' + validWallet)).toBe(true));
      // Second rotation should throw
      await expect(
        service.initiateKeyRotation('user-1', validWallet, validPrivateKey, validPrivateKey, 'routine')
      ).rejects.toThrow('Key rotation already in progress');
    });

    it('throws for invalid currentPrivateKey format', async () => {
      await expect(
        service.initiateKeyRotation('user-1', validWallet, 'invalid', validPrivateKey, 'routine')
      ).rejects.toThrow('Invalid private key format');
    });

    it('throws for invalid newPrivateKey format', async () => {
      await expect(
        service.initiateKeyRotation('user-1', validWallet, validPrivateKey, 'invalid', 'routine')
      ).rejects.toThrow('Invalid private key format');
    });

    it('accepts valid keys regardless of userId type', async () => {
      // userId validation is not done at the key validation level
      const result = await service.initiateKeyRotation('user-null-test', validWallet, validPrivateKey, validPrivateKey, 'routine');
      expect(result.status).toBe('success');
    });

    it('releases lock on success', async () => {
      const result = await service.initiateKeyRotation('user-2', validWallet, validPrivateKey, validPrivateKey, 'routine');
      expect(result.status).toBe('success');
      expect(result.rotationId).toBeDefined();
      expect(service.rotationLocks.has('user-2:' + validWallet)).toBe(false);
    });

    it('releases lock on failure', async () => {
      mockKeyManagementService.retrieveEncryptedKey.mockRejectedValue(new Error('DB error'));
      await expect(
        service.initiateKeyRotation('user-3', validWallet, validPrivateKey, validPrivateKey, 'routine')
      ).rejects.toThrow('Key rotation failed');
      expect(service.rotationLocks.has('user-3:' + validWallet)).toBe(false);
    });
  });

  describe('createRotationRecord', () => {
    it('generates UUID-based rotation ID', async () => {
      const rotationId = await service.createRotationRecord('user-1', validWallet, 'routine');
      expect(rotationId).toMatch(/^rot_[a-f0-9-]+$/);
    });
  });

  describe('getRotationHistory', () => {
    it('returns empty array on error', async () => {
      const { supabase } = await import('../../src/config/db.js');
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
              }),
            }),
          }),
        }),
      });
      const history = await service.getRotationHistory('user-1', validWallet);
      expect(history).toEqual([]);
    });
  });

  describe('enforceKeyRotationPolicy', () => {
    it('returns requiresRotation false when no wallets found', async () => {
      const { supabase } = await import('../../src/config/db.js');
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });
      const result = await service.enforceKeyRotationPolicy('user-1');
      expect(result.requiresRotation).toBe(false);
    });
  });
});
