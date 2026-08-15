import { supabaseAdmin } from '../../config/db.js';
import logger from '../../middleware/logger.js';
import crypto from 'crypto';

/**
 * Transactional Outbox Service
 *
 * Targets the authoritative `event_outbox` table created by the unified
 * Supabase pipeline (supabase/migrations/20260810000000_event_outbox_and_read_model.sql).
 * The legacy `outbox_events` table is only created by a migration in the LEGACY
 * folder, which the Supabase pipeline does not apply — writing to it fails with
 * 42P01 (relation does not exist) on a Supabase-backed deployment, which in turn
 * flipped a successfully-committed order mutation into a 500 (#14703).
 *
 * Every write here is best-effort: a failed outbox write must NEVER turn a
 * successfully-committed order mutation into a 500. `orderRepository.updateOrder`
 * documents the outbox write as best-effort / never-throws, so `writeEvent`
 * logs-and-swallows instead of rethrowing.
 */
export class OutboxService {
  /**
   * Write an outbox event. Call this AFTER a successful order DB write
   * within the same logical operation so the event is always durable.
   *
   * Best-effort: on any failure we log and return null rather than throw,
   * so the caller (e.g. updateOrder) never sees a 500 for an already-committed
   * mutation.
   */
  async writeEvent({ aggregateId, aggregateType = 'order', eventType, payload }) {
    if (!aggregateId || !eventType) {
      logger.warn('[OutboxService] Skipping outbox write — missing aggregateId or eventType');
      return null;
    }

    const eventId = crypto.randomUUID();
    try {
      const { data, error } = await supabaseAdmin
        .from('event_outbox')
        .insert({
          event_id: eventId,
          aggregate_id: aggregateId,
          event_type: eventType,
          payload: payload ?? {},
          status: 'pending',
        })
        .select('event_id')
        .single();

      if (error) {
        logger.error('[OutboxService] Failed to write outbox event:', error.message, { aggregateId, eventType });
        return null;
      }

      logger.info('[OutboxService] Outbox event written:', { eventId, aggregateId, eventType });
      return data?.event_id ?? null;
    } catch (err) {
      logger.error('[OutboxService] Exception writing outbox event:', err?.message, { aggregateId, eventType });
      return null;
    }
  }

  /**
   * Fetch pending outbox events for the relay worker.
   */
  async fetchPendingEvents(limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('event_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('[OutboxService] Failed to fetch pending events:', error.message);
      return [];
    }
    return data ?? [];
  }

  /**
   * Mark an event as published after successful Kafka delivery.
   */
  async markPublished(eventId) {
    const { error } = await supabaseAdmin
      .from('event_outbox')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('event_id', eventId);

    if (error) {
      logger.error('[OutboxService] Failed to mark event published:', error.message, { eventId });
    }
  }

  /**
   * Mark an event as failed and increment the attempt counter.
   *
   * `event_outbox` has no `failed` status (its check constraint only allows
   * pending/publishing/published). A non-delivered event is returned to
   * `pending` with `last_error` + `attempts` bumped so the relay reclaims it
   * (next_attempt_at is already managed by the claim RPC).
   */
  async markFailed(eventId, errorMessage) {
    if (!eventId) {
      logger.warn('[OutboxService] Skipping markFailed — missing eventId');
      return;
    }

    const { data: current, error: fetchError } = await supabaseAdmin
      .from('event_outbox')
      .select('attempts')
      .eq('event_id', eventId)
      .single();

    if (fetchError) {
      logger.warn('[OutboxService] Failed to read attempts:', fetchError.message, { eventId });
    }

    const currentAttempts = Number.isFinite(current?.attempts) ? current.attempts : 0;

    const { error } = await supabaseAdmin
      .from('event_outbox')
      .update({
        status: 'pending',
        last_error: String(errorMessage).slice(0, 1000),
        attempts: currentAttempts + 1,
        next_attempt_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (error) {
      logger.error('[OutboxService] Failed to mark event failed:', error.message, { eventId });
    }
  }

  /**
   * Reset stuck events back to pending for retry (up to maxRetries attempts).
   */
  async requeueFailedEvents(maxRetries = 5) {
    const { error } = await supabaseAdmin
      .from('event_outbox')
      .update({ status: 'pending' })
      .eq('status', 'publishing')
      .lt('attempts', maxRetries);

    if (error) {
      logger.error('[OutboxService] Failed to requeue events:', error.message);
    }
  }
}

export const outboxService = new OutboxService();
