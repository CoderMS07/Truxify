/**
 * Unit tests for backend/api/src/services/webhook/escrowVerification.js
 *
 * Uses the REAL ethers library for hashing/ABI (event encoding/parsing) and
 * only swaps the JsonRpcProvider for a controllable mock, so the on-chain
 * correlation logic (topic matching, bookingId binding, amount tolerance) is
 * genuinely exercised against real ethers semantics.
 *
 * Run with:  npm test -- test/unit/escrowVerification.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const provider = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
  getBlockNumber: vi.fn(),
}));

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal();
  class MockJsonRpcProvider {
    getTransaction(...args) {
      return provider.getTransaction(...args);
    }
    getTransactionReceipt(...args) {
      return provider.getTransactionReceipt(...args);
    }
    getBlockNumber(...args) {
      return provider.getBlockNumber(...args);
    }
  }
  return { ...actual, ethers: { ...actual.ethers, JsonRpcProvider: MockJsonRpcProvider } };
});

import { ethers } from 'ethers';
import logger from '../../src/middleware/logger.js';
import {
  normalizeTxHash,
  verifyPolygonEscrowTransaction,
  verifyPolygonWithdrawalTransaction,
  EscrowVerificationError,
} from '../../src/services/webhook/escrowVerification.js';
import { getEscrowBookingId } from '../../src/services/escrow.js';

const ESCROW = '0x0987654321098765432109876543210987654321';
const OTHER_CONTRACT = '0x1111111111111111111111111111111111111111';
const DRIVER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const PAYMENT_RELEASED_IFACE = new ethers.Interface([
  'event PaymentReleased(uint256 indexed bookingId, address indexed driver, uint256 paymentAmount)',
]);

function paymentReleasedLog(orderDisplayId, driverAddress = DRIVER, amountWei = 1_000_000_000_000_000_000n) {
  const bookingId = getEscrowBookingId(orderDisplayId);
  const topics = [
    PAYMENT_RELEASED_IFACE.getEvent('PaymentReleased').topicHash,
    ethers.zeroPadValue(ethers.toBeHex(BigInt(bookingId)), 32),
    ethers.zeroPadValue(driverAddress.toLowerCase(), 32),
  ];
  const data = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(amountWei)]);
  return { address: ESCROW, topics, data };
}

function validTxAndReceipt({ orderDisplayId = '#OD1', amountWei = 1_000_000_000_000_000_000n, logs } = {}) {
  const receiptLogs = logs || [paymentReleasedLog(orderDisplayId, DRIVER, amountWei)];
  provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
  provider.getTransactionReceipt.mockResolvedValue({ status: 1, to: ESCROW, blockNumber: 195, logs: receiptLogs });
  provider.getBlockNumber.mockResolvedValue(200);
}

async function expectRejected(promise, code, retryable) {
  try {
    await promise;
    throw new Error(`expected rejection with ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(EscrowVerificationError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ESCROW_RELEASE_CONFIRMATIONS;
  delete process.env.ESCROW_VERIFICATION_RPC_TIMEOUT_MS;
  process.env.POLYGON_RPC_URL = 'https://polygon-rpc.example';
  process.env.ESCROW_CONTRACT_ADDRESS = ESCROW;
});

describe('normalizeTxHash', () => {
  it('accepts a full 32-byte hash and lowercases it', () => {
    const upper = `0x${'AB'.repeat(32)}`;
    expect(normalizeTxHash(upper)).toBe(`0x${'ab'.repeat(32)}`);
    expect(normalizeTxHash(`0x${'ab'.repeat(32)}`)).toBe(`0x${'ab'.repeat(32)}`);
  });

  it('rejects short hashes, addresses, hex numbers and non-strings', () => {
    expect(normalizeTxHash('0xabc')).toBeNull();
    expect(normalizeTxHash(`0x${'ab'.repeat(31)}`)).toBeNull();
    expect(normalizeTxHash(ESCROW)).toBeNull();
    expect(normalizeTxHash(123)).toBeNull();
    expect(normalizeTxHash(null)).toBeNull();
    expect(normalizeTxHash(undefined)).toBeNull();
  });
});

describe('verifyPolygonEscrowTransaction — payload & configuration guards', () => {
  it('rejects a missing or malformed transaction hash as non-retryable', async () => {
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: '0xabc', orderDisplayId: '#OD1' }),
      'INVALID_TX_HASH',
      false,
    );
    await expectRejected(
      verifyPolygonEscrowTransaction({ orderDisplayId: '#OD1' }),
      'INVALID_TX_HASH',
      false,
    );
    expect(provider.getTransaction).not.toHaveBeenCalled();
  });

  it('rejects when POLYGON_RPC_URL is not configured', async () => {
    delete process.env.POLYGON_RPC_URL;
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'BLOCKCHAIN_NOT_CONFIGURED',
      false,
    );
  });

  it('rejects when ESCROW_CONTRACT_ADDRESS is not configured', async () => {
    delete process.env.ESCROW_CONTRACT_ADDRESS;
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'BLOCKCHAIN_NOT_CONFIGURED',
      false,
    );
  });
});

describe('verifyPolygonEscrowTransaction — on-chain checks', () => {
  it('rejects a transaction that does not exist on Polygon (retryable)', async () => {
    provider.getTransaction.mockResolvedValue(null);
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'TRANSACTION_NOT_FOUND',
      true,
    );
  });

  it('rejects a pending transaction (retryable)', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW }); // no blockNumber
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'TRANSACTION_PENDING',
      true,
    );
  });

  it('rejects a transaction that targets a different contract (non-retryable)', async () => {
    provider.getTransaction.mockResolvedValue({ to: OTHER_CONTRACT, blockNumber: 200 });
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'WRONG_CONTRACT',
      false,
    );
  });

  it('rejects a missing receipt (retryable)', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
    provider.getTransactionReceipt.mockResolvedValue(null);
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'RECEIPT_NOT_FOUND',
      true,
    );
  });

  it('rejects a reverted transaction (non-retryable)', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
    provider.getTransactionReceipt.mockResolvedValue({ status: 0, to: ESCROW, blockNumber: 195, logs: [] });
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'TRANSACTION_FAILED',
      false,
    );
  });

  it('rejects a receipt whose target is not the escrow contract (non-retryable)', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
    provider.getTransactionReceipt.mockResolvedValue({ status: 1, to: OTHER_CONTRACT, blockNumber: 195, logs: [] });
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'WRONG_CONTRACT',
      false,
    );
  });

  it('rejects when the transaction has too few confirmations (retryable)', async () => {
    process.env.ESCROW_RELEASE_CONFIRMATIONS = '5';
    validTxAndReceipt(); // block 195, current 200 -> 6 confirmations
    provider.getBlockNumber.mockResolvedValue(198); // -> 4 confirmations < 5
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'INSUFFICIENT_CONFIRMATIONS',
      true,
    );
  });

  it('honours ESCROW_RELEASE_CONFIRMATIONS from the environment', async () => {
    process.env.ESCROW_RELEASE_CONFIRMATIONS = '5';
    validTxAndReceipt();
    const result = await verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' });
    expect(result.confirmations).toBe(6);
  });
});

describe('verifyPolygonEscrowTransaction — event correlation (release path)', () => {
  it('rejects when the receipt has no PaymentReleased event (non-retryable)', async () => {
    validTxAndReceipt({ logs: [] });
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'PAYMENT_RELEASED_EVENT_NOT_FOUND',
      false,
    );
  });

  it('rejects a PaymentReleased event for a different order (non-retryable)', async () => {
    validTxAndReceipt({ orderDisplayId: '#OTHER' });
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'ORDER_MISMATCH',
      false,
    );
  });

  it('rejects a released amount outside the tolerance (non-retryable)', async () => {
    validTxAndReceipt({ orderDisplayId: '#OD1', amountWei: 2_000_000_000_000_000_000n });
    await expectRejected(
      verifyPolygonEscrowTransaction({
        txHash: `0x${'ab'.repeat(32)}`,
        orderDisplayId: '#OD1',
        expectedAmountWei: '1000000000000000000',
      }),
      'AMOUNT_MISMATCH',
      false,
    );
  });

  it('accepts amounts within the 1 gwei tolerance', async () => {
    validTxAndReceipt({ orderDisplayId: '#OD1', amountWei: 1_000_000_000_000_000_000n + 1_000_000_000n });
    const result = await verifyPolygonEscrowTransaction({
      txHash: `0x${'ab'.repeat(32)}`,
      orderDisplayId: '#OD1',
      expectedAmountWei: '1000000000000000000',
    });
    expect(result.ok).toBe(true);
  });

  it('skips the amount check when no expected amount is known', async () => {
    validTxAndReceipt({ orderDisplayId: '#OD1', amountWei: 5_000_000_000_000_000_000n });
    const result = await verifyPolygonEscrowTransaction({
      txHash: `0x${'ab'.repeat(32)}`,
      orderDisplayId: '#OD1',
      expectedAmountWei: null,
    });
    expect(result.ok).toBe(true);
  });

  it('verifies a valid PaymentReleased transaction for the order', async () => {
    validTxAndReceipt();
    const txHash = `0x${'ab'.repeat(32)}`;
    const result = await verifyPolygonEscrowTransaction({ txHash, orderDisplayId: '#OD1' });

    expect(result.ok).toBe(true);
    expect(result.txHash).toBe(txHash);
    expect(result.blockNumber).toBe(195);
    expect(result.confirmations).toBe(6);
    expect(result.orderDisplayId).toBe('#OD1');
    expect(result.driver.toLowerCase()).toBe(DRIVER);
    expect(result.amount).toBe('1000000000000000000');
    expect(result.bookingId).toBe(getEscrowBookingId('#OD1'));
    expect(logger.info).toHaveBeenCalled();
  });

  it('logs but does not fail on a driver wallet mismatch (bookingId is authoritative)', async () => {
    validTxAndReceipt();
    const result = await verifyPolygonEscrowTransaction({
      txHash: `0x${'ab'.repeat(32)}`,
      orderDisplayId: '#OD1',
      driverWalletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(result.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Driver wallet mismatch'));
  });

  it('requires orderDisplayId for the release path (non-retryable)', async () => {
    validTxAndReceipt();
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}` }),
      'INVALID_PAYLOAD',
      false,
    );
  });
});

describe('verifyPolygonEscrowTransaction — RPC failure handling (fail closed, never false success)', () => {
  async function captureRejection(promise) {
    try {
      await promise;
      throw new Error('expected rejection');
    } catch (err) {
      return err;
    }
  }

  it('classifies a getTransaction provider failure as retryable RPC_ERROR', async () => {
    provider.getTransaction.mockRejectedValue(new Error('ECONNREFUSED connect https://polygon-rpc.example'));
    const err = await captureRejection(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
    );
    expect(err).toBeInstanceOf(EscrowVerificationError);
    expect(err.code).toBe('RPC_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('classifies a getTransactionReceipt provider failure as retryable RPC_ERROR', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
    provider.getTransactionReceipt.mockRejectedValue(new Error('socket hang up'));
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'RPC_ERROR',
      true,
    );
  });

  it('classifies a getBlockNumber provider failure as retryable RPC_ERROR', async () => {
    validTxAndReceipt();
    provider.getBlockNumber.mockRejectedValue(new Error('provider unavailable'));
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'RPC_ERROR',
      true,
    );
  });

  it('classifies rate-limiting responses as retryable RPC_RATE_LIMITED', async () => {
    provider.getTransaction.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 429'), { code: 'SERVER_ERROR' }),
    );
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'RPC_RATE_LIMITED',
      true,
    );
  });

  it('never leaks raw provider error details to callers', async () => {
    provider.getTransaction.mockRejectedValue(
      new Error('internal rpc failure at https://secret-rpc.example.com/v2/API_KEY'),
    );
    const err = await captureRejection(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
    );
    expect(err.code).toBe('RPC_ERROR');
    expect(err.message).not.toContain('secret-rpc.example.com');
    expect(err.message).not.toContain('API_KEY');
    expect(err.message).not.toContain('ECONNREFUSED');
  });

  it('enforces the configured RPC timeout as a retryable RPC_TIMEOUT', async () => {
    process.env.ESCROW_VERIFICATION_RPC_TIMEOUT_MS = '40';
    provider.getTransaction.mockImplementation(() => new Promise(() => {})); // never settles
    await expectRejected(
      verifyPolygonEscrowTransaction({ txHash: `0x${'ab'.repeat(32)}`, orderDisplayId: '#OD1' }),
      'RPC_TIMEOUT',
      true,
    );
  }, 5000);
});

describe('verifyPolygonWithdrawalTransaction — receipt-level only', () => {
  it('verifies a successful escrow transaction without requiring a PaymentReleased event', async () => {
    validTxAndReceipt({ logs: [] });
    const result = await verifyPolygonWithdrawalTransaction({ txHash: `0x${'ab'.repeat(32)}` });
    expect(result.ok).toBe(true);
    expect(result.eventName).toBeUndefined();
  });

  it('still enforces the receipt-level guarantees', async () => {
    provider.getTransaction.mockResolvedValue({ to: ESCROW, blockNumber: 200 });
    provider.getTransactionReceipt.mockResolvedValue({ status: 0, to: ESCROW, blockNumber: 195, logs: [] });
    await expectRejected(
      verifyPolygonWithdrawalTransaction({ txHash: `0x${'ab'.repeat(32)}` }),
      'TRANSACTION_FAILED',
      false,
    );
  });
});
