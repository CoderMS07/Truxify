import { describe, it, expect, vi, beforeEach } from 'vitest';
import EscalationHandler, { ESCALATION_LEVELS, ESCALATION_THRESHOLDS } from '../../src/services/blockchain/escalationHandler.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: (name, fn) => fn(),
}));

describe('EscalationHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new EscalationHandler({});
  });

  describe('constructor', () => {
    it('creates handler with empty maps', () => {
      expect(handler.activeAlerts.size).toBe(0);
      expect(handler.escalationTimers.size).toBe(0);
    });

    it('stores injected dependencies', () => {
      const mockNotif = { sendAlert: vi.fn() };
      const mockRouter = { route: vi.fn() };
      const h = new EscalationHandler({ notificationService: mockNotif, alertRouter: mockRouter });
      expect(h.notificationService).toBe(mockNotif);
      expect(h.alertRouter).toBe(mockRouter);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateAlertId', () => {
    it('generates a 16-char hex string', () => {
      const alert = { type: 'TX_STUCK', driver: 'driver-123' };
      const id = handler.generateAlertId(alert);
      expect(typeof id).toBe('string');
      expect(id.length).toBe(16);
      expect(id).toMatch(/^[0-9a-f]+$/);
    });

    it('uses driver field when present', () => {
      const a = { type: 'TX_STUCK', driver: 'driver-456' };
      const b = { type: 'TX_STUCK', driver: 'driver-789' };
      expect(handler.generateAlertId(a)).not.toBe(handler.generateAlertId(b));
    });

    it('falls back to wallet when no driver', () => {
      const a = { type: 'TX_STUCK', wallet: '0xwallet' };
      const b = { type: 'TX_STUCK', wallet: '0xanother' };
      expect(handler.generateAlertId(a)).not.toBe(handler.generateAlertId(b));
    });

    it('falls back to shipmentId when no driver or wallet', () => {
      const a = { type: 'DELAYED', shipmentId: 'ship-001' };
      const b = { type: 'DELAYED', shipmentId: 'ship-002' };
      expect(handler.generateAlertId(a)).not.toBe(handler.generateAlertId(b));
    });

    it('uses unknown when no identifier field', () => {
      const a = { type: 'GENERIC' };
      const b = { type: 'GENERIC' };
      expect(handler.generateAlertId(a)).toBe(handler.generateAlertId(b)); // same "unknown"
    });
  });

  describe('getLevelName', () => {
    it('returns ALERT for level 0', () => {
      expect(handler.getLevelName(ESCALATION_LEVELS.ALERT)).toBe('ALERT');
    });

    it('returns ON_CALL for level 1', () => {
      expect(handler.getLevelName(ESCALATION_LEVELS.ON_CALL)).toBe('ON_CALL');
    });

    it('returns SENIOR_ENGINEER for level 2', () => {
      expect(handler.getLevelName(ESCALATION_LEVELS.SENIOR_ENGINEER)).toBe('SENIOR_ENGINEER');
    });

    it('returns OPERATIONS for level 3', () => {
      expect(handler.getLevelName(ESCALATION_LEVELS.OPERATIONS)).toBe('OPERATIONS');
    });

    it('returns UNKNOWN for unknown level', () => {
      expect(handler.getLevelName(99)).toBe('UNKNOWN');
    });
  });

  describe('getEscalationMessage', () => {
    it('returns on-call message for ON_CALL level', () => {
      const msg = handler.getEscalationMessage(ESCALATION_LEVELS.ON_CALL);
      expect(msg).toContain('on-call');
    });

    it('returns senior message for SENIOR_ENGINEER level', () => {
      const msg = handler.getEscalationMessage(ESCALATION_LEVELS.SENIOR_ENGINEER);
      expect(msg).toContain('senior');
    });

    it('returns operations message for OPERATIONS level', () => {
      const msg = handler.getEscalationMessage(ESCALATION_LEVELS.OPERATIONS);
      expect(msg).toContain('operations');
    });

    it('returns default message for unknown level', () => {
      expect(handler.getEscalationMessage(99)).toBe('Escalation in progress');
    });
  });

  describe('ESCALATION_THRESHOLDS', () => {
    it('FIRST_ESCALATION is 5 minutes', () => {
      expect(ESCALATION_THRESHOLDS.FIRST_ESCALATION).toBe(5 * 60 * 1000);
    });

    it('SECOND_ESCALATION is 15 minutes', () => {
      expect(ESCALATION_THRESHOLDS.SECOND_ESCALATION).toBe(15 * 60 * 1000);
    });

    it('FINAL_ESCALATION is 60 minutes', () => {
      expect(ESCALATION_THRESHOLDS.FINAL_ESCALATION).toBe(60 * 60 * 1000);
    });
  });

  describe('ESCALATION_LEVELS', () => {
    it('has sequential level values', () => {
      expect(ESCALATION_LEVELS.ALERT).toBe(0);
      expect(ESCALATION_LEVELS.ON_CALL).toBe(1);
      expect(ESCALATION_LEVELS.SENIOR_ENGINEER).toBe(2);
      expect(ESCALATION_LEVELS.OPERATIONS).toBe(3);
    });
  });
});
