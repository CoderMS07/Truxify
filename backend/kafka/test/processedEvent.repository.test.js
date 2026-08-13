/**
 * Unit tests for backend/kafka/repositories/processedEvent.repository.js
 *
 * Regression test for issue #6288 (RLS via supabaseAdmin) and the
 * consumer-group idempotency-scoping bug: with four independent Kafka
 * consumer groups (order-service, notification-service, analytics-service,
 * fraud-service) subscribed to overlapping topics, the idempotency registry
 * must be keyed per (consumer_group, topic, event_id) so that one group
 * claiming an event never suppresses delivery to the others.
 *
 * Coverage:
 *   - first claim for a (consumer_group, topic, event_id) returns true
 *   - duplicate claim for the same (consumer_group, topic, event_id) returns false
 *   - the SAME (topic, event_id) can be claimed independently by two
 *     different consumer groups (the core regression for this bug)
 *   - the claim is issued through the service-role client (supabaseAdmin)
 *
 * Run with:  npm test -- test/processedEvent.repository.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertedKeys = new Set();

vi.mock('../../api/src/config/db.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn((record) => ({
        select: vi.fn(() => {
          const key = `${record.consumer_group}:${record.topic}:${record.event_id}`;
          if (insertedKeys.has(key)) {
            return Promise.resolve({ data: [], error: null });
          }
          insertedKeys.add(key);
          return Promise.resolve({ data: [{ event_id: record.event_id }], error: null });
        }),
      })),
    })),
  },
}));

vi.mock('../../api/src/middleware/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import processedEventRepository from '../repositories/processedEvent.repository.js';
import { supabaseAdmin } from '../../api/src/config/db.js';

describe('ProcessedEventRepository.claimProcessed', () => {
  beforeEach(() => {
    insertedKeys.clear();
    vi.clearAllMocks();
  });

  it('returns true the first time an event is claimed by a group', async () => {
    const claimed = await processedEventRepository.claimProcessed('order-service', 'payment.confirmed', 'evt-001');
    expect(claimed).toBe(true);
  });

  it('returns false when the same group claims the same (topic, event_id) again', async () => {
    await processedEventRepository.claimProcessed('order-service', 'payment.confirmed', 'evt-001');
    const second = await processedEventRepository.claimProcessed('order-service', 'payment.confirmed', 'evt-001');
    expect(second).toBe(false);
  });

  it('treats different topics as distinct idempotency keys', async () => {
    await processedEventRepository.claimProcessed('order-service', 'payment.confirmed', 'evt-001');
    const otherTopic = await processedEventRepository.claimProcessed('order-service', 'trip.completed', 'evt-001');
    expect(otherTopic).toBe(true);
  });

  it('allows the same (topic, event_id) to be claimed independently by different consumer groups', async () => {
    const orderServiceClaim = await processedEventRepository.claimProcessed(
      'order-service',
      'payment.confirmed',
      'evt-shared-001'
    );
    const notificationServiceClaim = await processedEventRepository.claimProcessed(
      'notification-service',
      'payment.confirmed',
      'evt-shared-001'
    );
    const analyticsServiceClaim = await processedEventRepository.claimProcessed(
      'analytics-service',
      'payment.confirmed',
      'evt-shared-001'
    );
    const fraudServiceClaim = await processedEventRepository.claimProcessed(
      'fraud-service',
      'payment.confirmed',
      'evt-shared-001'
    );

    expect(orderServiceClaim).toBe(true);
    expect(notificationServiceClaim).toBe(true);
    expect(analyticsServiceClaim).toBe(true);
    expect(fraudServiceClaim).toBe(true);

    // But a second claim by the SAME group for the SAME event is still a duplicate.
    const orderServiceReplay = await processedEventRepository.claimProcessed(
      'order-service',
      'payment.confirmed',
      'evt-shared-001'
    );
    expect(orderServiceReplay).toBe(false);
  });

  it('issues the claim through the service-role client (supabaseAdmin)', async () => {
    await processedEventRepository.claimProcessed('order-service', 'payment.confirmed', 'evt-001');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('kafka_processed_events');
  });
});