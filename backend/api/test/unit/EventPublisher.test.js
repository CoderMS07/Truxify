import { describe, it, expect, vi } from 'vitest'
import { EventPublisher } from '../../src/core/events/EventPublisher.js'

describe('EventPublisher', () => {
  it('publish throws until implemented by an adapter', async () => {
    const publisher = new EventPublisher()
    await expect(publisher.publish({})).rejects.toThrow(/must be implemented/)
  })

  it('has the default connection state', () => {
    const publisher = new EventPublisher()
    expect(publisher.isConnected).toBe(false)
    expect(publisher.connect()).resolves.toBeUndefined()
  })

  it('publishBatch publishes every event in order', async () => {
    const published = []
    class FakePublisher extends EventPublisher {
      async publish(event) {
        published.push(event.id)
      }
    }
    const publisher = new FakePublisher()
    await publisher.publishBatch([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(published).toEqual([1, 2, 3])
  })

  it('publishBatch propagates publish errors', async () => {
    class FailingPublisher extends EventPublisher {
      async publish() {
        throw new Error('adapter down')
      }
    }
    await expect(new FailingPublisher().publishBatch([{ id: 1 }])).rejects.toThrow('adapter down')
  })
})
