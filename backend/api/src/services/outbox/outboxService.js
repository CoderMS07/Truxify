import { supabaseAdmin } from '../../config/db.js';
import logger from '../../middleware/logger.js';
import crypto from 'crypto';

/**
 * Transactional Outbox Service
 * Inserts durable event records atomically with order mutations.
 * A separate relay picks them up and publishes to Kafka/event bus.
 */
export class OutboxService {
  /**
   * Write an outbox event. Call this AFTER a successful order DB write
   * within the same logical operation so the event is always durable.
   */
  async writeEvent({ aggregateId, aggregateType = 'order', eventType, payload }) {
    if (!aggregateId || !eventType) {
      logger.warn('[OutboxService] Skipping outbox write — missing aggregateId or eventType');
      return null;
    }

    const eventId = crypto.randomUUID();
    const { data, error } = await supabaseAdmin
      .from('outbox_events')
      .insert({
        id: eventId,
        aggregate_id: aggregateId,
        aggregate_type: aggregateType,
        event_type: eventType,
        payload: payload ?? {},
        status: 'pending',
        created_at: new Date().toISOString(),
        retry_count: 0,
      })
      .select('id')
      .single();

    if (error) {
      // Surface the failure so the caller can decide how to handle a
      // non-atomic write (the order mutation may already have committed).
      logger.error('[OutboxService] Failed to write outbox event:', error.message, { aggregateId, eventType });
      throw error;
    }

    logger.info('[OutboxService] Outbox event written:', { eventId, aggregateId, eventType });
    return data?.id ?? null;
  }

  /**
   * Fetch pending outbox events for the relay worker.
   */
  async fetchPendingEvents(limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('outbox_events')
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
      .from('outbox_events')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) {
      logger.error('[OutboxService] Failed to mark event published:', error.message, { eventId });
      throw error;
    }
  }

  /**
   * Mark an event as failed and increment retry_count.
   *
   * The new retry_count is computed in JS: the previous implementation
   * assigned an unawaited `supabase.rpc('increment', ...)` Promise to the
   * column, so the counter never advanced and dead-lettering never triggered.
   */
  async markFailed(eventId, errorMessage) {
    if (!eventId) {
      logger.warn('[OutboxService] Skipping markFailed — missing eventId');
      return;
    }

    const { data: current, error: fetchError } = await supabaseAdmin
      .from('outbox_events')
      .select('retry_count')
      .eq('id', eventId)
      .single();

    if (fetchError) {
      logger.warn('[OutboxService] Failed to read retry_count:', fetchError.message, { eventId });
    }

    const currentRetryCount = Number.isFinite(current?.retry_count) ? current.retry_count : 0;

    const { error } = await supabaseAdmin
      .from('outbox_events')
      .update({
        status: 'failed',
        last_error: String(errorMessage).slice(0, 1000),
        retry_count: currentRetryCount + 1,
        last_attempted_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      logger.error('[OutboxService] Failed to mark event failed:', error.message, { eventId });
    }
  }

  /**
   * Move events that have exhausted their retry budget to the dead-letter
   * store (outbox_dlq) so they are never silently lost. Events reaching
   * retry_count >= maxRetries are copied to outbox_dlq and removed from
   * outbox_events, and an alert is emitted so operators can replay them.
   */
  async deadLetterExhaustedEvents(maxRetries = 5) {
    const { data: exhausted, error: fetchError } = await supabaseAdmin
      .from('outbox_events')
      .select('*')
      .eq('status', 'failed')
      .gte('retry_count', maxRetries);

    if (fetchError) {
      logger.error('[OutboxService] Failed to fetch exhausted events:', fetchError.message);
      return;
    }

    if (!exhausted || exhausted.length === 0) return;

    const now = new Date().toISOString();
    const dlqRows = exhausted.map((e) => ({
      original_id: e.id,
      aggregate_id: e.aggregate_id,
      aggregate_type: e.aggregate_type,
      event_type: e.event_type,
      payload: e.payload ?? {},
      last_error: e.last_error,
      retry_count: e.retry_count,
      last_attempted_at: e.last_attempted_at,
      created_at: e.created_at,
      dead_lettered_at: now,
      status: 'pending',
    }));

    const { error: insertError } = await supabaseAdmin
      .from('outbox_dlq')
      .insert(dlqRows);

    if (insertError) {
      logger.error('[OutboxService] Failed to write dead-letter rows:', insertError.message);
      return;
    }

    const ids = exhausted.map((e) => e.id);
    const { error: deleteError } = await supabaseAdmin
      .from('outbox_events')
      .delete()
      .in('id', ids);

    if (deleteError) {
      logger.error('[OutboxService] Failed to clear dead-lettered events:', deleteError.message, { ids });
      return;
    }

    // Alert: these events can no longer be retried automatically and require
    // manual/automated replay via replayDeadLetter().
    logger.error('[OutboxService] Dead-lettered exhausted outbox events for replay:', {
      count: exhausted.length,
      eventIds: ids,
    });
  }

  /**
   * Reset failed events back to pending for retry (up to maxRetries).
   */
  async requeueFailedEvents(maxRetries = 5) {
    const { error } = await supabaseAdmin
      .from('outbox_events')
      .update({ status: 'pending' })
      .eq('status', 'failed')
      .lt('retry_count', maxRetries);

    if (error) {
      logger.error('[OutboxService] Failed to requeue failed events:', error.message);
    }
  }

  /**
   * Replay a single dead-lettered event by re-inserting it into outbox_events
   * (status='pending', retry_count=0) and marking the DLQ row replayed.
   * Returns the original outbox event id, or null on failure.
   */
  async replayDeadLetter(dlqId) {
    if (!dlqId) {
      logger.warn('[OutboxService] Skipping replayDeadLetter — missing dlqId');
      return null;
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from('outbox_dlq')
      .select('*')
      .eq('id', dlqId)
      .single();

    if (fetchError || !row) {
      logger.error('[OutboxService] Failed to read dead-letter row:', fetchError?.message, { dlqId });
      return null;
    }

    const { error: insertError } = await supabaseAdmin
      .from('outbox_events')
      .insert({
        id: row.original_id,
        aggregate_id: row.aggregate_id,
        aggregate_type: row.aggregate_type,
        event_type: row.event_type,
        payload: row.payload ?? {},
        status: 'pending',
        retry_count: 0,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error('[OutboxService] Failed to reinsert dead-lettered event:', insertError.message, { dlqId });
      return null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('outbox_dlq')
      .update({ status: 'replayed', replayed_at: new Date().toISOString() })
      .eq('id', dlqId);

    if (updateError) {
      logger.error('[OutboxService] Failed to mark dead-letter replayed:', updateError.message, { dlqId });
    }

    logger.info('[OutboxService] Replayed dead-letter event:', { dlqId, eventId: row.original_id });
    return row.original_id;
  }
}

export const outboxService = new OutboxService();