import express from 'express';
import { getRouteEstimate } from '../services/osrm.js';
import { authenticate } from '../middleware/auth.js';
import { userLimiter } from '../middleware/rateLimiter.js';
import logger from '../middleware/logger.js';

const router = express.Router();

const validateCoordinates = (pickupLat, pickupLng, dropLat, dropLng) => {
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || 
      !Number.isFinite(dropLat) || !Number.isFinite(dropLng)) {
    return 'Invalid coordinates provided.';
  }
  if (pickupLat < -90 || pickupLat > 90) return 'pickup_lat must be between -90 and 90.';
  if (pickupLng < -180 || pickupLng > 180) return 'pickup_lng must be between -180 and 180.';
  if (dropLat < -90 || dropLat > 90) return 'drop_lat must be between -90 and 90.';
  if (dropLng < -180 || dropLng > 180) return 'drop_lng must be between -180 and 180.';
  
  return null;
};

// ============================================================================
// GET /api/routes/estimate
// ============================================================================
router.get('/estimate', authenticate, userLimiter, async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, drop_lat, drop_lng } = req.query;

    const pickupLat = Number(pickup_lat);
    const pickupLng = Number(pickup_lng);
    const dropLat = Number(drop_lat);
    const dropLng = Number(drop_lng);

    const validationError = validateCoordinates(pickupLat, pickupLng, dropLat, dropLng);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const estimate = await getRouteEstimate({
      pickupLat,
      pickupLng,
      dropLat,
      dropLng
    });

    if (!estimate) {
      return res.status(404).json({ error: 'Could not calculate route for given coordinates.' });
    }

    return res.json({
      distance_km: estimate.distanceKm,
      duration_hours: estimate.durationSeconds ? Number((estimate.durationSeconds / 3600).toFixed(2)) : null
    });
  } catch (err) {
    logger.error('Error calculating route estimate:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
