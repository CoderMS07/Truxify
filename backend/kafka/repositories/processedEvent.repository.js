import { supabaseAdmin } from '../../api/src/config/db.js';
import logger from '../../api/src/middleware/logger.js';

class ProcessedEventRepository {
  /**
   * Atomically claim a Kafka message as processed, scoped to a single
   * consumer group.
   *
   * Uses an upsert on the (consumer_group, topic, event_id) primary key so
   * concurrent or redelivered messages race safely within a group: only the
   * first insert wins. Crucially, the same (topic, event_id) can be claimed
   * independently by every other consumer group — each group runs its own
   * pipeline (read-model projection, notifications, analytics, fraud) and
   * must see every event it subscribes to, regardless of whether another
   * group has already claimed it.
   *
   * @param {string} consumerGroup - the Kafka consumer group id (e.g. 'notification-service')
   * @param {string} topic - the Kafka topic
   * @param {string} eventId - the event's idempotency key
   * @param {string|null} orderId - orders.id, when derivable from the event
   * @returns {Promise<boolean>} true when the message was newly claimed for
   *          this consumer group, false when this group had already
   *          processed it.
   */
  async claimProcessed(consumerGroup, topic, eventId, orderId = null) {
    try {
      const { data, error } = await supabaseAdmin
        .from('kafka_processed_events')
        .upsert({
          consumer_group: consumerGroup,
          topic,
          event_id: eventId,
          order_id: orderId || null,
        }, {
          onConflict: 'consumer_group,topic,event_id',
          ignoreDuplicates: true,
        })
        .select('event_id');

      if (error) throw error;
      return Array.isArray(data) ? data.length > 0 : data !== null;
    } catch (error) {
      logger.error(`Failed to claim processed event ${eventId} on ${topic} for group ${consumerGroup}:`, error);
      throw error;
    }
  }
}

export default new ProcessedEventRepository();