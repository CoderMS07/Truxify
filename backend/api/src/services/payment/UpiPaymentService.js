import logger from '../../middleware/logger.js';

class UpiPaymentService {
  constructor() {
    this.gatewayName = process.env.UPI_GATEWAY || 'Razorpay (Mock)';
  }

  /**
   * Mock payment collection creation (e.g. Razorpay Order)
   */
  async createPaymentOrder(orderId, amountPaisa) {
    logger.info(`[UPI Payment] Creating order on ${this.gatewayName} for Truxify Order ${orderId}, amount: ${amountPaisa} paisa`);
    // Mock successful order/intent creation
    return {
      gateway_order_id: `pay_${Math.random().toString(36).substring(2, 15)}`,
      amount: amountPaisa,
      currency: 'INR',
      status: 'created',
      upi_deep_link: `upi://pay?pa=truxify@merchant&pn=Truxify&am=${(amountPaisa / 100).toFixed(2)}&cu=INR`
    };
  }

  /**
   * Mock payout to driver UPI ID
   */
  async processDriverPayout(driverUpiId, amountPaisa) {
    logger.info(`[UPI Payout] Initiating driver payout via ${this.gatewayName} to ${driverUpiId}, amount: ${amountPaisa} paisa`);
    // Simulate payout API delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      payout_id: `pout_${Math.random().toString(36).substring(2, 15)}`,
      status: 'processed',
      utr: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
      processed_at: new Date().toISOString()
    };
  }
}

export default new UpiPaymentService();
