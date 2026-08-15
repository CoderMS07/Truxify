import { describe, it, expect } from 'vitest';

const UpiPaymentService = (await import('../../../../src/services/payment/UpiPaymentService.js')).default;

describe('UpiPaymentService', () => {
  // Use the singleton directly (stateless service)
  const service = UpiPaymentService;

  describe('constructor', () => {
    it('uses default gateway name when UPI_GATEWAY env is not set', () => {
      expect(service.gatewayName).toBe('Razorpay (Mock)');
    });
  });

  describe('createPaymentOrder', () => {
    it('throws not-implemented error with integration guidance', async () => {
      await expect(service.createPaymentOrder('order-1', 50000)).rejects.toThrow(/not implemented/i);
      await expect(service.createPaymentOrder('order-1', 50000)).rejects.toThrow(/Razorpay|UPI/i);
    });
  });

  describe('processDriverPayout', () => {
    it('throws TypeError when driverUpiId is not a string', async () => {
      await expect(service.processDriverPayout(12345, 50000)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout(null, 50000)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout(undefined, 50000)).rejects.toThrow(TypeError);
    });

    it('throws TypeError when driverUpiId is an empty string', async () => {
      await expect(service.processDriverPayout('', 50000)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout('   ', 50000)).rejects.toThrow(TypeError);
    });

    it('throws TypeError when amountPaisa is not a positive finite number', async () => {
      await expect(service.processDriverPayout('driver@upi', -100)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout('driver@upi', 0)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout('driver@upi', NaN)).rejects.toThrow(TypeError);
      await expect(service.processDriverPayout('driver@upi', Infinity)).rejects.toThrow(TypeError);
    });

    it('returns payout record with required fields on success', async () => {
      const result = await service.processDriverPayout('driver@upi', 50000);

      expect(result).toHaveProperty('payout_id');
      expect(result).toHaveProperty('status', 'processed');
      expect(result).toHaveProperty('utr');
      expect(result).toHaveProperty('processed_at');

      expect(result.payout_id).toMatch(/^pout_/);
      expect(result.utr.length).toBeGreaterThan(0);
    });

    it('includes ISO timestamp in processed_at', async () => {
      const result = await service.processDriverPayout('driver@upi', 25000);
      const timestamp = new Date(result.processed_at);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('returns processed status for valid payout', async () => {
      const result = await service.processDriverPayout('valid@upi', 100000);
      expect(result.status).toBe('processed');
    });

    it('handles large payout amounts correctly', async () => {
      const largeAmount = 1000000000; // 1 crore in paisa
      const result = await service.processDriverPayout('driver@upi', largeAmount);
      expect(result.payout_id).toBeDefined();
    });
  });
});
