/**
 * In-memory request deduplication cache.
 *
 * Prevents duplicate expensive operations (DB queries, external API calls) within
 * a single request lifecycle by caching results keyed by a caller-supplied string.
 *
 * This is a per-request cache — instances should be created fresh for each request
 * or managed by a request-scoped DI container. For cross-request caching, use Redis.
 *
 * @class RequestCache
 * @example
 * const cache = new RequestCache();
 * cache.set('user-profile:123', profileData);
 * const profile = cache.get('user-profile:123');
 */

export class RequestCache {
  constructor() {
    this._cache = new Map();
  }

  get(key) {
    return this._cache.get(key);
  }

  set(key, value) {
    this._cache.set(key, value);
    return this;
  }

  has(key) {
    return this._cache.has(key);
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }
}


// === Spec 25: ===
// === Spec 25: event listener leak guard ===
import { EventEmitter } from 'node:events';
export function attachResponseCleanup(emitter, res, eventName = 'data') {
  const onData = () => {};
  emitter.on(eventName, onData);
  const cleanup = () => {
    emitter.removeListener(eventName, onData);
    res.removeListener('finish', cleanup);
    res.removeListener('close', cleanup);
  };
  res.on('finish', cleanup);
  res.on('close', cleanup);
  return cleanup;
}

