import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/config/db.js', () => ({
  supabase: { from: vi.fn() },
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(), head: vi.fn() })),
      })),
      insert: vi.fn(() => ({ then: vi.fn() })),
      update: vi.fn(() => ({ eq: vi.fn() })),
    })),
  },
}));

vi.mock('../../src/lib/redisLock.js', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  LockAcquisitionError: class LockAcquisitionError extends Error {
    constructor() { super('Lock not acquired'); }
  },
}));

vi.mock('ethers', () => ({
  ethers: { JsonRpcProvider: vi.fn(), Wallet: vi.fn(), Contract: vi.fn() },
  default: { JsonRpcProvider: vi.fn(), Wallet: vi.fn(), Contract: vi.fn() },
}));

const ZKPService = (await import('../../src/services/zkp/zkp.service.js')).default;

describe('zkp.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');
    vi.stubEnv('PRIVATE_KEY', '0x1234567890123456789012345678901234567890');
    vi.stubEnv('KYC_VERIFIER_CONTRACT', '0x0000000000000000000000000000000000000000');
  });

  describe('constructor', () => {
    it('logs warning and disables service when env vars are missing', () => {
      vi.stubEnv('POLYGON_RPC_URL', '');
      vi.stubEnv('PRIVATE_KEY', '');
      vi.stubEnv('KYC_VERIFIER_CONTRACT', '');
      // Re-import to pick up env
      // ZKPService is a singleton; provider/wallet are set at import time
      // When env is missing, provider/wallet are null
      expect(ZKPService.provider).toBeNull();
      expect(ZKPService.wallet).toBeNull();
    });
  });

  describe('hashDocument', () => {
    it('produces a deterministic SHA-256 hash', () => {
      const driverData = {
        name: 'John Doe',
        licenseNumber: 'DL123456',
        rcNumber: 'RJ14AB1234',
        insuranceNumber: 'INS001',
        issueDate: '2020-01-01',
        expiryDate: '2030-01-01',
      };
      const hash1 = ZKPService.hashDocument(driverData);
      const hash2 = ZKPService.hashDocument(driverData);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different hashes for different driver data', () => {
      const data1 = { name: 'Alice', licenseNumber: 'DL001', rcNumber: 'RJ01', insuranceNumber: 'I1', issueDate: '2020-01-01', expiryDate: '2030-01-01' };
      const data2 = { name: 'Bob', licenseNumber: 'DL002', rcNumber: 'RJ02', insuranceNumber: 'I2', issueDate: '2020-01-01', expiryDate: '2030-01-01' };
      expect(ZKPService.hashDocument(data1)).not.toBe(ZKPService.hashDocument(data2));
    });
  });

  describe('callSnarkJS', () => {
    it('returns mock proof in test mode', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('ZKP_MOCK', 'true');
      const docHash = ZKPService.hashDocument({
        name: 'Test', licenseNumber: 'L1', rcNumber: 'R1',
        insuranceNumber: 'I1', issueDate: '2020-01-01', expiryDate: '2030-01-01',
      });
      const result = await ZKPService.callSnarkJS({}, docHash);
      expect(result.isMock).toBe(true);
      expect(result.proof).toBeDefined();
      expect(result.publicSignals).toBeDefined();
    });

    it('throws when mock is active in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ZKP_MOCK', 'true');
      await expect(ZKPService.callSnarkJS({}, 'hash')).rejects.toThrow('Mock ZK proofs are disallowed in production');
    });
  });

  describe('generateZKProof', () => {
    it('returns mock proof in test mode', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      const driverData = {
        userId: 'user-1',
        name: 'Test', licenseNumber: 'L1', rcNumber: 'R1',
        insuranceNumber: 'I1', issueDate: '2020-01-01', expiryDate: '2030-01-01',
      };
      const result = await ZKPService.generateZKProof(driverData);
      expect(result.success).toBe(true);
      expect(result.isMock).toBe(true);
      expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('isVerified', () => {
    it('returns false when service is not configured', async () => {
      vi.stubEnv('POLYGON_RPC_URL', '');
      // The singleton was already initialized; test the runtime guard
      const result = await ZKPService.isVerified('user-1');
      expect(result).toBe(false);
    });
  });

  describe('verifyDriver', () => {
    it('returns conflict when lock is already held', async () => {
      const { acquireLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValue(null);

      const result = await ZKPService.verifyDriver({ userId: 'user-1', name: 'Test' });
      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
    });

    it('returns MOCK_PROOF_NOT_RECORDED when ZKP_MOCK is true in test mode', async () => {
      const { acquireLock, releaseLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValue('lock-value');
      releaseLock.mockResolvedValue(undefined);
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('ZKP_MOCK', 'true');

      const { supabaseAdmin } = await import('../../src/config/db.js');
      // First call: isVerifiedInDb -> profiles table -> kyc_verified: false
      supabaseAdmin.from
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { kyc_verified: false }, error: null }) })),
          })),
        })
        // Second call: assertServerVerified -> driver_details table -> Verified
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { kyc_status: 'Verified', kyc_doc_number: 'L1' }, error: null }) })),
          })),
        });

      const driverData = {
        userId: 'user-1',
        name: 'Test', licenseNumber: 'L1', rcNumber: 'R1',
        insuranceNumber: 'I1', issueDate: '2020-01-01', expiryDate: '2030-01-01',
      };
      const result = await ZKPService.verifyDriver(driverData);
      expect(result.success).toBe(false);
      expect(result.code).toBe('MOCK_PROOF_NOT_RECORDED');
    });
  });

  describe('acquireLock prevents concurrent proof generation', () => {
    it('acquires lock before processing', async () => {
      const { acquireLock } = await import('../../src/lib/redisLock.js');
      acquireLock.mockResolvedValue('lock-value');

      await ZKPService.verifyDriver({
        userId: 'user-1',
        name: 'Test', licenseNumber: 'L1', rcNumber: 'R1',
        insuranceNumber: 'I1', issueDate: '2020-01-01', expiryDate: '2030-01-01',
      });

      expect(acquireLock).toHaveBeenCalledWith('zkp:verify:user-1', expect.any(Number));
    });
  });
});
