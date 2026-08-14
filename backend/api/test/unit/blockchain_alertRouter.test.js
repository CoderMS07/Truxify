import { describe, it, expect, vi, beforeEach } from 'vitest';
import AlertRouter, { ALERT_CHANNELS, SEVERITY_LEVELS } from '../../src/services/blockchain/alertRouter.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

vi.mock('../../src/core/performanceMetrics.js', () => ({
  measureExecution: async (name, fn) => fn(),
}));

describe('alertRouter', () => {
  let router;
  let mockSlackClient;
  let mockEmailService;
  let mockSmsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSlackClient = { sendMessage: vi.fn().mockResolvedValue({}) };
    mockEmailService = { send: vi.fn().mockResolvedValue({}) };
    mockSmsService = { send: vi.fn().mockResolvedValue({}) };
    router = new AlertRouter({
      slackClient: mockSlackClient,
      emailService: mockEmailService,
      smsService: mockSmsService,
    });
  });

  describe('route', () => {
    it('routes CRITICAL alerts to Slack, SMS, and Email', async () => {
      const alert = { type: 'TEST', severity: SEVERITY_LEVELS.CRITICAL };
      await router.route(alert);
      expect(mockSlackClient.sendMessage).toHaveBeenCalled();
      expect(mockEmailService.send).toHaveBeenCalled();
    });

    it('routes HIGH alerts to Slack and Email', async () => {
      const alert = { type: 'TEST', severity: SEVERITY_LEVELS.HIGH };
      await router.route(alert);
      expect(mockSlackClient.sendMessage).toHaveBeenCalled();
      expect(mockEmailService.send).toHaveBeenCalled();
    });

    it('routes MEDIUM alerts to Slack only', async () => {
      const alert = { type: 'TEST', severity: SEVERITY_LEVELS.MEDIUM };
      await router.route(alert);
      expect(mockSlackClient.sendMessage).toHaveBeenCalled();
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('routes LOW alerts to Dashboard only', async () => {
      const alert = { type: 'TEST', severity: SEVERITY_LEVELS.LOW };
      await router.route(alert);
      expect(mockSlackClient.sendMessage).not.toHaveBeenCalled();
    });

    it('falls back to Dashboard for unknown severity', async () => {
      const alert = { type: 'TEST', severity: 'UNKNOWN' };
      await router.route(alert);
      expect(mockSlackClient.sendMessage).not.toHaveBeenCalled();
    });

    it('handles channel send failures gracefully', async () => {
      mockSlackClient.sendMessage.mockRejectedValue(new Error('Slack down'));
      const alert = { type: 'TEST', severity: SEVERITY_LEVELS.MEDIUM };
      const results = await router.route(alert);
      expect(results).toBeDefined();
    });
  });

  describe('sendSlackAlert', () => {
    it('skips when slackClient is not configured', async () => {
      router.slackClient = null;
      const result = await router.sendSlackAlert({ type: 'TEST', severity: 'MEDIUM' });
      expect(result).toBeNull();
    });

    it('formats and sends Slack message', async () => {
      const alert = { type: 'PAYMENT_RECEIVED', severity: 'MEDIUM', driver: '0x123', reason: 'Test reason' };
      await router.sendSlackAlert(alert);
      expect(mockSlackClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: expect.any(Array) })
      );
    });
  });

  describe('sendEmailAlert', () => {
    it('skips when emailService is not configured', async () => {
      router.emailService = null;
      const result = await router.sendEmailAlert({ type: 'TEST', severity: 'HIGH' });
      expect(result).toBeNull();
    });

    it('sends email with formatted subject and body', async () => {
      const alert = { type: 'INSURANCE_CLAIM_REJECTED', severity: 'HIGH', reason: 'Invalid claim', txHash: '0xtx' };
      await router.sendEmailAlert(alert);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('[HIGH]') })
      );
    });
  });

  describe('sendSMSAlert', () => {
    it('skips when smsService is not configured', async () => {
      router.smsService = null;
      const result = await router.sendSMSAlert({ type: 'TEST', severity: 'CRITICAL' });
      expect(result).toBeNull();
    });

    it('sends SMS to configured recipients', async () => {
      // Directly set the env via process.env
      const original = process.env.ALERT_SMS_RECIPIENTS;
      process.env.ALERT_SMS_RECIPIENTS = '+1234567890,+0987654321';
      const alert = { type: 'BALANCE_UPDATE_FAILED', severity: 'CRITICAL', reason: 'Insufficient funds' };
      await router.sendSMSAlert(alert);
      expect(mockSmsService.send).toHaveBeenCalledTimes(2);
      process.env.ALERT_SMS_RECIPIENTS = original;
    });
  });

  describe('formatSlackMessage', () => {
    it('returns structured Slack message with attachments', () => {
      const alert = { type: 'GEOFENCE_BREACH', severity: 'HIGH', driver: '0xabc', reason: 'Out of bounds' };
      const msg = router.formatSlackMessage(alert);
      expect(msg.attachments).toBeDefined();
      expect(msg.attachments[0].color).toBeDefined();
    });
  });

  describe('getSeverityColor', () => {
    it('returns correct colors for each severity', () => {
      expect(router.getSeverityColor('CRITICAL')).toBe('danger');
      expect(router.getSeverityColor('HIGH')).toBe('warning');
      expect(router.getSeverityColor('MEDIUM')).toBe('good');
      expect(router.getSeverityColor('LOW')).toBe('#808080');
      expect(router.getSeverityColor('UNKNOWN')).toBe('#808080');
    });
  });

  describe('getTypeEmoji', () => {
    it('returns emoji for known types', () => {
      expect(router.getTypeEmoji('PAYMENT_RECEIVED')).toBeTruthy();
      expect(router.getTypeEmoji('GEOFENCE_BREACH')).toBe('[WARNING]');
      expect(router.getTypeEmoji('UNKNOWN_TYPE')).toBe('📢');
    });
  });
});
