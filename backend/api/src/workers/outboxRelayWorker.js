import { outboxService } from '../services/outbox/outboxService.js';
import { eventBus } from '../core/events/index.js';
import logger from '../middleware/logger.js';

const RELAY_INTERVAL_MS = parseInt(process.env.OUTBOX_RELAY_INTERVAL_MS, 10) || 5000;
const MAX_RETRIES = parseInt(process.env.OUTBOX_MAX_RETRIES, 10) || 5;

let _relayTimer = null;
let _running = false;

async function relayOnce() {
  if (_running) return;
  _running = true;

  try {
    await outboxService.requeueFailedEvents(MAX_RETRIES);
    const events = await outboxService.fetchPendingEvents(50);

    for (const event of events) {
      try {
        // Publish via existing eventBus — idempotent on consumer side via processed_events
        const published = eventBus.emitSafe(event.event_type, {
          eventId: event.id,
          aggregateId: event.aggregate_id,
          aggregateType: event.aggregate_type,
          payload: event.payload,
          createdAt: event.created_at,
        });

        // emitSafe returns false when no listeners are registered (it swallows
        // listener errors internally and never throws). Only mark published when
        // at least one listener was actually called.
        if (published) {
          try {
            await outboxService.markPublished(event.id);
            logger.info('[OutboxRelay] Published event:', { eventId: event.id, type: event.event_type });
          } catch (markErr) {
            logger.error('[OutboxRelay] Failed to mark event published:', { eventId: event.id, err: markErr.message });
          }
        } else {
          logger.warn('[OutboxRelay] No listeners registered for event type — skipping publish:', { eventId: event.id, type: event.event_type });
        }
      } catch (err) {
        logger.error('[OutboxRelay] Failed to publish event:', { eventId: event.id, err: err.message });
        try {
          await outboxService.markFailed(event.id, err.message);
        } catch (markErr) {
          logger.error('[OutboxRelay] Failed to mark event failed:', { eventId: event.id, err: markErr.message });
        }
      }
    }
  } catch (err) {
    logger.error('[OutboxRelay] Relay cycle error:', err.message);
  } finally {
    _running = false;
  }
}

export function startOutboxRelayWorker() {
  if (_relayTimer) return;
  logger.info('[OutboxRelay] Starting outbox relay worker');
  _relayTimer = setInterval(relayOnce, RELAY_INTERVAL_MS);
  // Run immediately on start
  relayOnce();
}

export function stopOutboxRelayWorker() {
  if (_relayTimer) {
    clearInterval(_relayTimer);
    _relayTimer = null;
    logger.info('[OutboxRelay] Outbox relay worker stopped');
  }
}