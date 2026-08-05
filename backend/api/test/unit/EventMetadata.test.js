import { describe, it, expect } from 'vitest'
import {
  EventMetadata,
  EVENT_VERSIONS,
  EVENT_SOURCES,
  EVENT_CATEGORIES,
} from '../../src/core/events/EventMetadata.js'

describe('EventMetadata', () => {
  it('exposes frozen constant maps', () => {
    expect(Object.isFrozen(EVENT_VERSIONS)).toBe(true)
    expect(Object.isFrozen(EVENT_SOURCES)).toBe(true)
    expect(Object.isFrozen(EVENT_CATEGORIES)).toBe(true)
    expect(EVENT_VERSIONS.CURRENT).toBe('1.0')
  })

  it('uses a generated eventId and ISO timestamp when not provided', () => {
    const meta = new EventMetadata({ eventType: 'order.created', source: 'order-service' })
    expect(meta.eventId).toBeTruthy()
    expect(meta.eventType).toBe('order.created')
    expect(meta.source).toBe('order-service')
    expect(new Date(meta.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('defaults source to INTERNAL when omitted', () => {
    const meta = new EventMetadata({ eventType: 'x' })
    expect(meta.source).toBe(EVENT_SOURCES.INTERNAL)
  })

  it('defaults category to DOMAIN and version to CURRENT', () => {
    const meta = new EventMetadata({ eventType: 'x' })
    expect(meta.category).toBe(EVENT_CATEGORIES.DOMAIN)
    expect(meta.version).toBe(EVENT_VERSIONS.CURRENT)
  })

  it('serializes to JSON and round-trips via fromJSON', () => {
    const meta = new EventMetadata({
      eventId: 'e1',
      eventType: 'order.created',
      source: 'order-service',
      correlationId: 'c1',
    })
    const json = meta.toJSON()
    expect(json.eventId).toBe('e1')
    expect(json.eventType).toBe('order.created')
    expect(json.correlationId).toBe('c1')

    const restored = EventMetadata.fromJSON(json)
    expect(restored.eventId).toBe('e1')
    expect(restored.eventType).toBe('order.created')
    expect(restored.source).toBe('order-service')
  })
})
