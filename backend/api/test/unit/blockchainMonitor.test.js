import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: async (name, fn) => fn(),
}));

describe('BlockchainMonitor', () => {
  let BlockchainMonitor;
  let monitor;
  let mockAlertRouter;
  let mockMetricsService;
  let mockEscalationHandler;

  beforeEach(async () => {
    vi.useFakeTimers();

    mockAlertRouter = { route: vi.fn().mockResolvedValue(undefined) };
    mockMetricsService = {
      recordBlockScan: vi.fn(),
      recordBlockScanError: vi.fn(),
      recordPaymentEvent: vi.fn(),
      recordInsuranceEvent: vi.fn(),
      recordGeofenceBreach: vi.fn(),
      recordBalanceUpdateFailure: vi.fn(),
      recordContractRevert: vi.fn(),
    };
    mockEscalationHandler = { escalate: vi.fn().mockResolvedValue(undefined) };

    vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.example.com');
    vi.stubEnv('ESCROW_CONTRACT_ADDRESS', '0x1234567890123456789012345678901234567890');

    const mod = await import('../../src/services/blockchain/blockchainMonitor.js');
    BlockchainMonitor = mod.default;

    monitor = new BlockchainMonitor({
      alertRouter: mockAlertRouter,
      metricsService: mockMetricsService,
      escalationHandler: mockEscalationHandler,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor (dependency injection)', () => {
    it('accepts alertRouter dependency', () => {
      expect(monitor.alertRouter).toBe(mockAlertRouter);
    });

    it('accepts metricsService dependency', () => {
      expect(monitor.metricsService).toBe(mockMetricsService);
    });

    it('accepts escalationHandler dependency', () => {
      expect(monitor.escalationHandler).toBe(mockEscalationHandler);
    });

    it('defaults isListening and isScanning to false', () => {
      expect(monitor.isListening).toBe(false);
      expect(monitor.isScanning).toBe(false);
    });
  });

  describe('initialize', () => {
    it('returns false when RPC URL is not configured', async () => {
      vi.stubEnv('POLYGON_RPC_URL', '');
      const m = new BlockchainMonitor({});
      const result = await m.initialize();
      expect(result).toBe(false);
    });

    it('returns false when contract address is not configured', async () => {
      vi.stubEnv('ESCROW_CONTRACT_ADDRESS', '');
      const m = new BlockchainMonitor({});
      const result = await m.initialize();
      expect(result).toBe(false);
    });
  });

  describe('setupEventHandlers', () => {
    it('registers handlers for all known event types', () => {
      monitor.setupEventHandlers();
      expect(monitor.eventHandlers['PaymentReceived']).toBeDefined();
      expect(monitor.eventHandlers['InsuranceClaimApproved']).toBeDefined();
      expect(monitor.eventHandlers['InsuranceClaimRejected']).toBeDefined();
      expect(monitor.eventHandlers['GeofenceBreach']).toBeDefined();
      expect(monitor.eventHandlers['BalanceUpdateFailed']).toBeDefined();
      expect(monitor.eventHandlers['SmartContractRevert']).toBeDefined();
    });
  });

  describe('stopListening', () => {
    it('sets isListening to false', async () => {
      monitor.isListening = true;
      await monitor.stopListening();
      expect(monitor.isListening).toBe(false);
    });
  });

  describe('startListening', () => {
    it('sets isListening to true on success', async () => {
      // Mock the contract so initialize passes
      monitor.contract = { on: vi.fn(), removeAllListeners: vi.fn() };
      monitor.provider = { getBlockNumber: vi.fn().mockResolvedValue(12345) };
      vi.spyOn(monitor, 'setupEventHandlers').mockImplementation(() => {});
      vi.spyOn(monitor, 'startPollingBlocks').mockImplementation(() => {});

      await monitor.startListening();

      expect(monitor.isListening).toBe(true);
    });
  });
});
