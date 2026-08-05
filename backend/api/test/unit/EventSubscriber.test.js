import { describe, it, expect, vi } from 'vitest'
import { EventSubscriber } from '../../src/core/events/EventSubscriber.js'

describe('EventSubscriber', () => {
  it('subscribe throws until implemented by an adapter', async () => {
    const subscriber = new EventSubscriber()
    await expect(subscriber.subscribe('x', vi.fn())).rejects.toThrow(/must be implemented/)
  })

  it('unsubscribe throws until implemented by an adapter', async () => {
    const subscriber = new EventSubscriber()
    await expect(subscriber.unsubscribe('x', vi.fn())).rejects.toThrow(/must be implemented/)
  })

  it('has the default connection state', () => {
    const subscriber = new EventSubscriber()
    expect(subscriber.isConnected).toBe(false)
  })

  it('subscribeAll subscribes each handler', async () => {
    const subscribed = []
    class FakeSubscriber extends EventSubscriber {
      async subscribe(eventType) {
        subscribed.push(eventType)
      }
    }
    await new FakeSubscriber().subscribeAll({ a: vi.fn(), b: vi.fn() })
    expect(subscribed).toEqual(['a', 'b'])
  })
})
