/**
 * Unit tests for backend/api/src/services/blockchain/escalationHandler.js
 *
 * Run with:  npm run test:unit -- test/unit/escalationHandler.test.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../middleware/logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../../core/performanceMetrics.js', () => ({
  measureExecution: async (name, fn) => fn(),
}));

const EscalationHandler = require('../../src/services/blockchain/escalationHandler.js').default;

describe('EscalationHandler', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    handler = new EscalationHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateAlertId', () => {
    it('generates a 16-char hex string', () => {
      const alert = { type: 'escrow_timeout', driver: 'driver-1' };
      const id = handler.generateAlertId(alert);
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic for the same alert', () => {
      const alert = { type: 'escrow_timeout', driver: 'driver-1' };
      const id1 = handler.generateAlertId(alert);
      const id2 = handler.generateAlertId(alert);
      expect(id1).toBe(id2);
    });
  });

  describe('duplicate alert detection', () => {
    it('does not warn for different alerts', async () => {
      const alert1 = { type: 'escrow_timeout', driver: 'driver-1' };
      const alert2 = { type: 'payment_failed', driver: 'driver-1' };
      await handler.escalate(alert1);
      vi.clearAllMocks();
      await handler.escalate(alert2);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('alert creation', () => {
    it('adds new alert to activeAlerts', async () => {
      const alert = { type: 'escrow_timeout', orderId: 'order-2' };
      await handler.escalate(alert);
      expect(handler.activeAlerts.size).toBe(1);
    });

    it('sets initial escalation level to ALERT (0)', async () => {
      const alert = { type: 'escrow_timeout', orderId: 'order-3' };
      await handler.escalate(alert);
      const record = handler.activeAlerts.values().next().value;
      expect(record.level).toBe(0);
    });

    it('sets resolved to false on new alert', async () => {
      const alert = { type: 'escrow_timeout', orderId: 'order-4' };
      await handler.escalate(alert);
      const record = handler.activeAlerts.values().next().value;
      expect(record.resolved).toBe(false);
    });
  });

  describe('resolveAlert', () => {
    it('resolves an active alert', async () => {
      const alert = { type: 'escrow_timeout', orderId: 'order-5' };
      await handler.escalate(alert);
      expect(handler.activeAlerts.size).toBe(1);

      const alertId = handler.activeAlerts.keys().next().value;
      const result = await handler.resolveAlert(alertId);

      expect(result).toBe(true);
      expect(handler.activeAlerts.size).toBe(0);
    });

    it('returns false for unknown alert', async () => {
      const result = await handler.resolveAlert('unknown-id-0000');
      expect(result).toBe(false);
    });
  });

  describe('getActiveAlerts', () => {
    it('returns unresolved alerts', async () => {
      await handler.escalate({ type: 'ALERT_1', driver: 'a' });
      await handler.escalate({ type: 'ALERT_2', driver: 'b' });

      const alerts = await handler.getActiveAlerts();
      expect(alerts).toHaveLength(2);
    });

    it('excludes resolved alerts', async () => {
      const alert = { type: 'ALERT_X', driver: 'c' };
      await handler.escalate(alert);
      const alertId = handler.activeAlerts.keys().next().value;
      await handler.resolveAlert(alertId);

      const alerts = await handler.getActiveAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getLevelName', () => {
    it('returns correct level names', () => {
      expect(handler.getLevelName(0)).toBe('ALERT');
      expect(handler.getLevelName(1)).toBe('ON_CALL');
      expect(handler.getLevelName(2)).toBe('SENIOR_ENGINEER');
      expect(handler.getLevelName(3)).toBe('OPERATIONS');
      expect(handler.getLevelName(99)).toBe('UNKNOWN');
    });
  });

  describe('getEscalationMessage', () => {
    it('returns correct escalation messages', () => {
      expect(handler.getEscalationMessage(1)).toBe('Alert not acknowledged. Paging on-call engineer.');
      expect(handler.getEscalationMessage(2)).toBe('Alert not resolved. Escalating to senior engineer.');
      expect(handler.getEscalationMessage(3)).toBe('Alert critical. Notifying operations team.');
      expect(handler.getEscalationMessage(99)).toBe('Escalation in progress');
    });
  });
});
