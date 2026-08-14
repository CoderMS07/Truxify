import { describe, it, expect, vi, beforeEach } from 'vitest';
import StateDivergenceDetector, { FINALITY_THRESHOLD } from '../../src/services/blockchain/stateDivergenceDetector.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: (name, fn) => fn(),
}));

vi.mock('../../src/config/db.js', () => ({
  supabase: {},
  supabaseAdmin: null,
}));

describe('StateDivergenceDetector', () => {
  let detector;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set env vars to avoid empty arrays
    process.env.POLYGON_RPC_URL = 'http://localhost:8545';
    // Mock ethers
    vi.stubGlobal('ethers', {
      JsonRpcProvider: vi.fn(() => ({})),
    });
  });

  afterEach(() => {
    delete process.env.POLYGON_RPC_URL;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates instance with empty divergences map', () => {
      const d = new StateDivergenceDetector({});
      expect(d.divergences.size).toBe(0);
      expect(d.stateCache.size).toBe(0);
    });

    it('parses RPC nodes from POLYGON_RPC_URL env', () => {
      process.env.POLYGON_RPC_URL = 'http://localhost:8545';
      const d = new StateDivergenceDetector({});
      expect(d.rpcNodes.length).toBe(1);
      expect(d.rpcNodes[0]).toBe('http://localhost:8545');
    });

    it('parses multiple RPC nodes from POLYGON_RPC_NODES env', () => {
      process.env.POLYGON_RPC_NODES = 'http://node1:8545, http://node2:8545';
      process.env.POLYGON_RPC_URL = 'http://fallback:8545';
      const d = new StateDivergenceDetector({});
      expect(d.rpcNodes.length).toBe(2);
    });
  });

  describe('calculateDivergenceSeverity', () => {
    it('returns NONE for 0 divergence', () => {
      const d = new StateDivergenceDetector({});
      expect(d.calculateDivergenceSeverity(0)).toBe('NONE');
    });

    it('returns LOW for divergence <= 5', () => {
      const d = new StateDivergenceDetector({});
      expect(d.calculateDivergenceSeverity(3)).toBe('LOW');
      expect(d.calculateDivergenceSeverity(5)).toBe('LOW');
    });

    it('returns MEDIUM for divergence <= 20', () => {
      const d = new StateDivergenceDetector({});
      expect(d.calculateDivergenceSeverity(10)).toBe('MEDIUM');
      expect(d.calculateDivergenceSeverity(20)).toBe('MEDIUM');
    });

    it('returns HIGH for divergence <= 50', () => {
      const d = new StateDivergenceDetector({});
      expect(d.calculateDivergenceSeverity(30)).toBe('HIGH');
      expect(d.calculateDivergenceSeverity(50)).toBe('HIGH');
    });

    it('returns CRITICAL for divergence > 50', () => {
      const d = new StateDivergenceDetector({});
      expect(d.calculateDivergenceSeverity(51)).toBe('CRITICAL');
      expect(d.calculateDivergenceSeverity(100)).toBe('CRITICAL');
    });
  });

  describe('analyzeDivergence', () => {
    let detector;

    beforeEach(() => {
      detector = new StateDivergenceDetector({});
    });

    it('returns no_divergence for empty node states', () => {
      const result = detector.analyzeDivergence([]);
      expect(result.divergenceDetected).toBe(false);
      expect(result.reason).toBe('no_responses');
    });

    it('returns divergenceDetected false for single node', () => {
      const result = detector.analyzeDivergence([{ blockNumber: 100, blockHash: '0x123' }]);
      expect(result.divergenceDetected).toBe(false);
    });

    it('detects no divergence for synced nodes', () => {
      const result = detector.analyzeDivergence([
        { blockNumber: 100, blockHash: '0xabc' },
        { blockNumber: 100, blockHash: '0xabc' },
      ]);
      expect(result.divergenceDetected).toBe(false);
      expect(result.blockDivergence).toBe(0);
      expect(result.severity).toBe('NONE');
    });

    it('detects divergence for desynced nodes (>10 block difference)', () => {
      const result = detector.analyzeDivergence([
        { blockNumber: 100, blockHash: '0xabc' },
        { blockNumber: 115, blockHash: '0xdef' },
      ]);
      expect(result.divergenceDetected).toBe(true);
      expect(result.blockDivergence).toBe(15);
      expect(result.severity).toBe('MEDIUM');
    });

    it('sets canonicalState to node with highest block number', () => {
      const nodeA = { blockNumber: 100 };
      const nodeB = { blockNumber: 105 };
      const result = detector.analyzeDivergence([nodeA, nodeB]);
      expect(result.canonicalState.blockNumber).toBe(105);
    });

    it('returns correct max/min block numbers', () => {
      const result = detector.analyzeDivergence([
        { blockNumber: 50 },
        { blockNumber: 100 },
        { blockNumber: 75 },
      ]);
      expect(result.maxBlockNumber).toBe(100);
      expect(result.minBlockNumber).toBe(50);
    });
  });

  describe('getDivergenceMetrics', () => {
    it('returns metrics object with expected fields', () => {
      const d = new StateDivergenceDetector({});
      const metrics = d.getDivergenceMetrics();
      expect(metrics.totalDivergences).toBe(0);
      expect(metrics.activeDivergences).toBe(0);
      expect(metrics.rpcNodeCount).toBe(1);
      expect(typeof metrics.bytelastChecked).toBe('string');
    });
  });

  describe('FINALITY_THRESHOLD', () => {
    it('is 100 blocks', () => {
      expect(FINALITY_THRESHOLD).toBe(100);
    });
  });
});
