import logger from '../middleware/logger.js';

/**
 * Fetches live traffic congestion metrics.
 * Uses a mock implementation for TomTom / Google Maps Distance Matrix.
 * Returns a traffic multiplier >= 1.0 based on current congestion.
 * 
 * @param {number} pickupLat 
 * @param {number} pickupLng 
 * @returns {Promise<number>}
 */
export async function getLiveTrafficMultiplier(pickupLat, pickupLng) {
  try {
    if (!pickupLat || !pickupLng) {
      return 1.0;
    }

    // In a real production scenario, this would call TomTom or Google Maps Distance Matrix API:
    // const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${process.env.TOMTOM_API_KEY}&point=${pickupLat},${pickupLng}`;
    // const response = await fetch(url);
    // if (!response.ok) throw new Error("Request failed");
const data = await response.json();
    // return calculateMultiplierFromData(data);

    // Mocking a live traffic integration:
    // If it's rush hour, dynamically generate a surge multiplier (1.2 to 2.5) based on coordinates hash to simulate localized congestion
    const hour = new Date().getHours();
    const isRushHour = (hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 19);

    if (isRushHour) {
      // sin(x) + cos(y) ranges over [-2, 2], so after Math.abs it's [0, 2] — normalize to [0, 1] before scaling
      const geoHash = Math.abs(Math.sin(pickupLat) + Math.cos(pickupLng)) / 2;
      const surgeMultiplier = Math.min(2.5, Math.max(1.2, 1.2 + (geoHash * 1.3))); // clamped to 1.2–2.5
      logger.info(`[TrafficService] Live traffic surge detected at ${pickupLat},${pickupLng}: x${surgeMultiplier.toFixed(2)}`);
      return Number(surgeMultiplier.toFixed(2));
    }

    return 1.0;
  } catch (error) {
    logger.error(`[TrafficService] Error fetching live traffic data: ${error.message}`);
    // Fail open, return normal multiplier
    return 1.0;
  }
}
