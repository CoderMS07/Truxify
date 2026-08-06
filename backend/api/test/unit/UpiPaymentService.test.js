import { describe, it, expect, vi } from 'vitest';
import UpiPaymentService from '../../src/services/payment/UpiPaymentService.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('UpiPaymentService', () => {
  describe('processDriverPayout', () => {
    it('should generate secure payout_id and utr using crypto modules', async () => {
      const amount = 500;
      const upiId = 'driver@upi';
      
      const result = await UpiPaymentService.processDriverPayout(upiId, amount);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('processed');
      expect(result.processed_at).toBeDefined();
      
      // Check payout_id format (pout_ + UUIDv4)
      // UUIDv4 format: 8-4-4-4-12 hex digits
      expect(result.payout_id).toMatch(/^pout_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      
      // Check utr format (12-digit number)
      expect(result.utr).toMatch(/^\d{12}$/);
      
      // Verify values are sufficiently random (entropy check)
      const result2 = await UpiPaymentService.processDriverPayout(upiId, amount);
      expect(result.payout_id).not.toBe(result2.payout_id);
      expect(result.utr).not.toBe(result2.utr);
    });
  });

  describe('createPaymentOrder', () => {
    it('should throw not implemented error', async () => {
      await expect(UpiPaymentService.createPaymentOrder('order_1', 100))
        .rejects.toThrow(/createPaymentOrder is not implemented/);
    });
  });
});
