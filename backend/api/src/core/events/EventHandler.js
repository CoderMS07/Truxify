import logger from '../../middleware/logger.js';

export class EventHandler {
  constructor(handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('EventHandler requires a function handler');
    }
    this._handler = handler;
    this._name = options.name || handler.name || 'anonymous';
    this._retryCount = options.retryCount ?? 0;
    this._timeout = options.timeout ?? 30000;
    this._onError = options.onError || null;
  }

  get name() {
    return this._name;
  }

  async handle(event) {
    try {
      const result = await Promise.race([
        this._handler(event),
        this._timeout > 0
          ? new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Handler "${this._name}" timed out after ${this._timeout}ms`)), this._timeout)
            )
          : Promise.resolve(),
      ]);
      return result;
    } catch (err) {
      if (this._onError) {
        return this._onError(err, event);
      }
      throw err;
    }
  }

  static wrap(fn, options = {}) {
    return new EventHandler(fn, options);
  }
}
