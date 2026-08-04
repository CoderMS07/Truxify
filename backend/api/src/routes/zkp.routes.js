import express from 'express';
import zkpService from '../services/zkp/zkp.service.js';
import { LockAcquisitionError } from '../lib/redisLock.js';
import logger from '../middleware/logger.js';

const router = express.Router();

/**
 * POST /zkp/verify
 *
 * Submits a driver's KYC documents for ZK-SNARK proof generation and
 * on-chain verification.
 *
 * Race-condition protection (issue #5729):
 *   zkpService.verifyDriver() now holds a per-user Redis distributed lock
 *   for the duration of the verification. This route handles the two extra
 *   error cases that can surface:
 *
 *   - LockAcquisitionError → Redis unavailable              → 503
 *   - result.conflict === true → lock held (duplicate req)  → 409
 *   - result.alreadyVerified === true → already done        → 200
 */
router.post('/verify', async (req, res) => {
  try {
    const {
      userId,
      name,
      licenseNumber,
      rcNumber,
      insuranceNumber,
      issueDate,
      expiryDate,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const result = await zkpService.verifyDriver({
      userId,
      name,
      licenseNumber,
      rcNumber,
      insuranceNumber,
      issueDate,
      expiryDate,
    });

    // Duplicate request while first is still in flight
    if (result.conflict) {
      return res.status(409).json({
        success: false,
        error: result.error,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    // Redis unavailable — the lock could not be acquired at all
    if (error instanceof LockAcquisitionError) {
      logger.error({ err: error }, '[ZKP] Redis unavailable — verification lock could not be acquired');
      return res.status(503).json({
        success: false,
        error: 'Verification service temporarily unavailable. Please try again shortly.',
      });
    }

    logger.error({ err: error }, '[ZKP] Unexpected error in /zkp/verify');
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /zkp/status/:userId
 * Returns the KYC verification status for a driver.
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const verified = await zkpService.isVerified(userId);
    return res.status(200).json({ success: true, verified });
  } catch (error) {
    logger.error({ err: error }, '[ZKP] Error in /zkp/status');
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /zkp/stats
 * Returns aggregate KYC verification counts.
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await zkpService.getVerificationStats();
    return res.status(200).json({ success: true, ...stats });
  } catch (error) {
    logger.error({ err: error }, '[ZKP] Error in /zkp/stats');
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;