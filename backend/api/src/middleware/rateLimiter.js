import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import * as Sentry from '@sentry/node';
import { redisClient } from '../config/db.js';
import logger from './logger.js';

function isRedisReady() {
  return redisClient && redisClient.status === 'ready';
}

/**
 * Store wrapper that defers the Redis/memory decision to request time.
 *
 * The limiters are constructed while this module is first imported, which
 * happens before the ioredis client has finished connecting. Picking the
 * store eagerly therefore always saw a non-ready client and pinned every
 * limiter to the in-memory store for the life of the process. This wrapper
 * serves requests from an in-memory fallback until Redis becomes ready, then
 * promotes itself to a RedisStore so counters are shared across instances.
 */
class DeferredRedisStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.options = null;
    this.memoryStore = new MemoryStore();
    this.redisStore = null;
    this.redisInitFailed = false;
  }

  init(options) {
    this.options = options;
    this.memoryStore.init(options);
  }

  activeStore() {
    if (this.redisStore) return this.redisStore;
    if (this.redisInitFailed || !isRedisReady()) return this.memoryStore;

    try {
      const store = new RedisStore({
        prefix: this.prefix,
        sendCommand: (command, ...args) => redisClient.call(command, ...args),
      });
      store.init(this.options);
      this.redisStore = store;
      logger.info(`Rate limiter "${this.prefix}" now backed by Redis.`);
      return store;
    } catch (err) {
      this.redisInitFailed = true;
      logger.error({ err }, `Failed to initialise Redis rate limiter store "${this.prefix}". Using in-memory fallback.`);
      return this.memoryStore;
    }
  }

  increment(key) {
    return this.activeStore().increment(key);
  }

  decrement(key) {
    return this.activeStore().decrement(key);
  }

  resetKey(key) {
    return this.activeStore().resetKey(key);
  }

  resetAll() {
    return this.activeStore().resetAll?.();
  }

  get(key) {
    return this.activeStore().get?.(key);
  }
}

/**
 * Generates a rate-limit key from the proxy-resolved IP address.
 */
export function safeIpKeyGenerator(req) {
  let ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  if (typeof ip === 'string') {
    ip = ip.replace(/^::ffff:/, '');
    if (ip === '::1') ip = '127.0.0.1';
  }
  return ip;
}

/**
 * Keys a limiter by the authenticated principal, falling back to the client IP
 */
export function userKeyGenerator(req) {
  if (req.user?.id) return `user:${req.user.id}`;
  if (req.user?.uid) return `uid:${req.user.uid}`;
  return safeIpKeyGenerator(req);
}

const sentryAlertHandler = (limiterName) => (req, res, next, options) => {
  logger.warn({ ip: req.ip, path: req.originalUrl, limiter: limiterName }, 'Rate limit exceeded');
  
  Sentry.withScope((scope) => {
    scope.setTag('event_type', 'rate_limit_exceeded');
    scope.setTag('limiter', limiterName);
    scope.setExtra('ip', req.ip);
    scope.setExtra('path', req.originalUrl);
    scope.setExtra('headers', req.headers);
    Sentry.captureMessage(`IP ${req.ip} exceeded rate limit on ${req.originalUrl} (${limiterName})`, 'warning');
  });

  return res.status(options.statusCode).json(options.message);
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeIpKeyGenerator,
  store: createStore('rl:global:'),
  handler: sentryAlertHandler('globalLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 900 },
  skip: (req) => req.path === '/health' || req.path.startsWith('/health/'),
});

export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  store: createStore('rl:user:'),
  handler: sentryAlertHandler('userLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 900 },
});

export const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeIpKeyGenerator,
  store: createStore('rl:health:'),
  handler: sentryAlertHandler('healthLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 60 },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeIpKeyGenerator,
  store: createStore('rl:auth:'),
  handler: sentryAlertHandler('authLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 3600 },
});

export const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  store: createStore('rl:bid:'),
  handler: sentryAlertHandler('bidLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 60 },
});

export const deviceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `user:${req.user.id}`;
    if (req.user?.uid) return `uid:${req.user.uid}`;
    return safeIpKeyGenerator(req);
  },
  store: createStore('rl:device:'),
  handler: sentryAlertHandler('deviceLimiter'),
  message: { error: 'Rate limit exceeded', retryAfter: 600 },
});

export function createStore(prefix) {
  return new DeferredRedisStore(prefix);
}

export const __testing = { DeferredRedisStore, isRedisReady };
