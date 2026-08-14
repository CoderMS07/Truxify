import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InternalEventAdapter } from '../../src/core/events/adapters/InternalEventAdapter.js';

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('InternalEventAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InternalEventAdapter();
  });

  it('is connected by default', () => {
    expect(adapter.isConnected).toBe(true);
  });

  it('connect sets connected to true', async () => {
    adapter._connected = false;
    await adapter.connect();
    expect(adapter.isConnected).toBe(true);
  });

  it('disconnect sets connected to false', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected).toBe(false);
  });

  it('publish emits event locally', async () => {
    const received = [];
    adapter.on('order.created', (event) => received.push(event));
    const event = { eventType: 'order.created', payload: { id: '123' } };
    await adapter.publish(event);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('publish throws when not connected', async () => {
    adapter._connected = false;
    await expect(adapter.publish({ eventType: 'test' })).rejects.toThrow('Not connected');
  });

  it('subscribe registers handler for event type', async () => {
    const handler = vi.fn();
    await adapter.subscribe('payment.processed', handler);
    const event = { eventType: 'payment.processed', payload: { amount: 500 } };
    await adapter.publish(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('subscribe throws when not connected', async () => {
    adapter._connected = false;
    await expect(adapter.subscribe('test', vi.fn())).rejects.toThrow('Not connected');
  });

  it('unsubscribe removes handler', async () => {
    const handler = vi.fn();
    await adapter.subscribe('trip.started', handler);
    await adapter.unsubscribe('trip.started', handler);
    await adapter.publish({ eventType: 'trip.started', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('disconnect removes all listeners', async () => {
    const handler = vi.fn();
    adapter.on('order.cancelled', handler);
    await adapter.disconnect();
    await adapter.publish({ eventType: 'order.cancelled', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });
});
