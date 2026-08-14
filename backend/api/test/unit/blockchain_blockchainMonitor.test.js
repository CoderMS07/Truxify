import { describe, it, expect, vi, beforeEach } from 'vitest';
import BlockchainMonitor from '../../src/services/blockchain/blockchainMonitor.js';

vi.mock('ethers', () => ({
  ethers: { JsonRpcProvider: vi.fn(), Contract: vi.fn(), Interface: vi.fn() },
  default: { JsonRpcProvider: vi.fn(), Contract: vi.fn(), Interface: vi.fn() },
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

vi.mock('../../src/config/db.js', () => ({
  supabase: { from: vi.fn() },
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: async (name, fn) => fn(),
}));

describe('blockchainMonitor', () => {
  let monitor;
  let mockAlertRouter;
  let mockMetricsService;
  let mockEscalationHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAlertRouter = { route: vi.fn().mockResolvedValue([]) };
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
    monitor = new BlockchainMonitor({
      alertRouter: mockAlertRouter,
      metricsService: mockMetricsService,
      escalationHandler: mockEscalationHandler,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with correct defaults', () => {
      expect(monitor.isListening).toBe(false);
      expect(monitor.isScanning).toBe(false);
      expect(monitor.lastBlockScanned).toBe(0);
    });
  });

  describe('initialize', () => {
    it('returns false when RPC_URL is missing', async () => {
      vi.stubEnv('POLYGON_RPC_URL', '');
      const result = await monitor.initialize();
      expect(result).toBe(false);
    });

    it('returns false when contract address is missing', async () => {
      vi.stubEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com');
      vi.stubEnv('ESCROW_CONTRACT_ADDRESS', '');
      const result = await monitor.initialize();
      expect(result).toBe(false);
    });
  });

  describe('startListening', () => {
    it('warns when already listening', async () => {
      monitor.isListening = true;
      await monitor.startListening();
      // Should warn and return early
    });

    it('warns when contract not initialized', async () => {
      monitor.contract = null;
      await monitor.startListening();
    });
  });

  describe('setupEventHandlers', () => {
    it('registers all 6 event handlers', () => {
      monitor.setupEventHandlers();
      expect(monitor.eventHandlers['PaymentReceived']).toBeDefined();
      expect(monitor.eventHandlers['InsuranceClaimApproved']).toBeDefined();
      expect(monitor.eventHandlers['InsuranceClaimRejected']).toBeDefined();
      expect(monitor.eventHandlers['GeofenceBreach']).toBeDefined();
      expect(monitor.eventHandlers['BalanceUpdateFailed']).toBeDefined();
      expect(monitor.eventHandlers['SmartContractRevert']).toBeDefined();
    });
  });

  describe('handlePaymentReceived', () => {
    it('creates alert and routes to alertRouter', async () => {
      monitor.setupEventHandlers();
      const args = ['0x123', { toString: () => '1000000' }, { toString: () => '1700000000' }];
      const log = { transactionHash: '0xtxhash', blockNumber: 123 };
      await monitor.handlePaymentReceived(args, log);
      expect(mockAlertRouter.route).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PAYMENT_RECEIVED', severity: 'MEDIUM' })
      );
      expect(mockMetricsService.recordPaymentEvent).toHaveBeenCalledWith('success');
    });
  });

  describe('handleInsuranceClaimRejected', () => {
    it('escalates HIGH severity alerts', async () => {
      monitor.setupEventHandlers();
      const args = [{ toString: () => '1' }, 'Invalid claim'];
      const log = { transactionHash: '0xtxhash', blockNumber: 123 };
      await monitor.handleInsuranceClaimRejected(args, log);
      expect(mockEscalationHandler.escalate).toHaveBeenCalled();
    });
  });

  describe('stopListening', () => {
    it('sets isListening to false', () => {
      monitor.isListening = true;
      monitor.stopListening();
      expect(monitor.isListening).toBe(false);
    });
  });
});
