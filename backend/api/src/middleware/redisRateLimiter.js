import { redisClient } from '../config/db.js';
import logger from './logger.js';

/**
 * Creates an Express middleware that enforces a per-user sliding-window
 * rate limit using a Redis sorted set.
 *
 * Key: `rl:{routeKey}:{userId}`
 * Members: random UUIDs (values don't matter; uniqueness prevents ZADD dedup)
 * Score: request timestamp in ms
 *
 * On each request:
 *   1. Remove members older than the window (ZREMRANGEBYSCORE)
 *   2. Count remaining members (ZCARD)
 *   3. If count >= limit → 429
 *   4. Otherwise → ZADD the new request, set key TTL, next()
 *
 * Failure semantics — fail open:
 *   Unlike redisLock (which fails closed), rate limiting fails open so that
 *   a Redis outage does not block all user traffic. A warning is logged so
 *   ops is aware that rate limiting is temporarily inactive.
 *
 * @param {object} options
 * @param {string} options.routeKey   Unique name for the route, e.g. 'zkp_verify'
 * @param {number} options.limit      Max requests per window
 * @param {number} options.windowMs   Window size in milliseconds
 */
export function redisRateLimiter({ routeKey, limit, windowMs }) {
  return async (req, res, next) => {
    if (!redisClient) {
      logger.warn('[RateLimiter] Redis unavailable — rate limiting bypassed for', routeKey);
      return next();
    }

    const userId = req.user?.id ?? req.ip;
    const key = `rl:${routeKey}:${userId}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const pipeline = redisClient.pipeline();
      pipeline.zremrangebyscore(key, '-inf', windowStart); // evict old entries
      pipeline.zcard(key);                                  // count remaining
      pipeline.zadd(key, now, `${now}-${Math.random()}`);  // record this request
      pipeline.pexpire(key, windowMs);                      // auto-clean key

      const results = await pipeline.exec();
      // results[1][1] is the ZCARD result (before adding the new entry)
      const requestCount = results[1][1];

      if (requestCount >= limit) {
        const oldestScore = await redisClient.zrange(key, 0, 0, 'WITHSCORES');
        const retryAfterMs =
          oldestScore.length >= 2
            ? Math.ceil(windowMs - (now - Number(oldestScore[1])))
            : windowMs;

        res.set('Retry-After', Math.ceil(retryAfterMs / 1000));
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please slow down.',
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        });
      }

      next();
    } catch (err) {
      logger.error({ err }, '[RateLimiter] Redis error — failing open for', routeKey);
      next(); // fail open
    }
  };
}
