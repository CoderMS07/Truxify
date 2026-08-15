import { describe, it, expect, vi, beforeEach } from 'vitest';
import Multicall3Service from '../../src/services/blockchain/multicall3Service.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: (name, fn) => fn(),
}));

describe('Multicall3Service', () => {
  let service;
  let mockContract;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContract = {
      aggregate3: vi.fn(),
      aggregate3Value: vi.fn(),
    };
    service = new Multicall3Service({ provider: {} });
    service.multicallContract = mockContract;
  });

  describe('constructor', () => {
    it('initializes with empty call cache', () => {
      const s = new Multicall3Service({});
      expect(s.callCache.size).toBe(0);
    });

    it('sets default cache timeout of 5000ms', () => {
      const s = new Multicall3Service({});
      expect(s.cacheTimeout).toBe(5000);
    });

    it('uses MULTICALL_CACHE_TIMEOUT_MS env var when set', async () => {
      process.env.MULTICALL_CACHE_TIMEOUT_MS = '10000';
      const mod = await import('../../src/services/blockchain/multicall3Service.js');
      const s = new mod.default({});
      expect(s.cacheTimeout).toBe(10000);
      delete process.env.MULTICALL_CACHE_TIMEOUT_MS;
    });
  });

  describe('batchCalls', () => {
    it('throws when multicall contract not initialized', async () => {
      const s = new Multicall3Service({});
      s.multicallContract = null;
      await expect(s.batchCalls([{ to: '0x1', data: '0xabc' }])).rejects.toThrow('Multicall3 service not initialized');
    });

    it('returns empty array for empty calls', async () => {
      const result = await service.batchCalls([]);
      expect(result).toEqual([]);
    });

    it('splits calls into chunks of MAX_CALLS_PER_BATCH (100)', async () => {
      mockContract.aggregate3.mockResolvedValue({ blockNumber: 1n, returnData: [] });
      const calls = Array.from({ length: 150 }, (_, i) => ({
        to: '0x1',
        data: `0x${i.toString(16)}`,
        allowFailure: false,
      }));
      await service.batchCalls(calls);
      expect(mockContract.aggregate3).toHaveBeenCalledTimes(2); // 100 + 50
    });

    it('returns results from single batch', async () => {
      mockContract.aggregate3.mockResolvedValue({
        blockNumber: 123n,
        returnData: [
          { success: true, returnData: '0x123' },
          { success: true, returnData: '0x456' },
        ],
      });
      const calls = [
        { to: '0x1', data: '0xabc', allowFailure: false },
        { to: '0x2', data: '0xdef', allowFailure: false },
      ];
      const result = await service.batchCalls(calls);
      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(true);
    });

    it('handles failed calls in results', async () => {
      mockContract.aggregate3.mockResolvedValue({
        blockNumber: 1n,
        returnData: [
          { success: false, returnData: '0x' },
          { success: true, returnData: '0x789' },
        ],
      });
      const calls = [{ to: '0x1', data: '0xabc', allowFailure: false }];
      const result = await service.batchCalls(calls);
      expect(result[0].success).toBe(false);
    });

    it('passes allowFailure flag to contract', async () => {
      mockContract.aggregate3.mockResolvedValue({ blockNumber: 1n, returnData: [] });
      const calls = [{ to: '0x1', data: '0xabc', allowFailure: true }];
      await service.batchCalls(calls);
      const [batchArg] = mockContract.aggregate3.mock.calls[0];
      expect(batchArg[0].allowFailure).toBe(true);
    });
  });
});
