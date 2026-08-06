const express = require('express');
const router = express.Router();

router.post('/api/deliveries/:id/geofence-confirm', (req, res) => {
  const { driver_lat, driver_lng, geofence_radius_m } = req.body;

  const lat = parseFloat(driver_lat);
  const lng = parseFloat(driver_lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid driver_lat or driver_lng' });
  }

  if (geofence_radius_m !== undefined) {
    const radius = parseFloat(geofence_radius_m);
    if (!Number.isFinite(radius) || radius <= 0) {
      return res.status(400).json({ error: 'Invalid geofence_radius_m' });
    }
  }

  return res.status(200).json({ success: true });
});

module.exports = router;
