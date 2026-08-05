import { describe, it, expect, vi } from 'vitest'
import { LocalEventEmitterAdapter } from '../../src/core/events/adapters/LocalEventEmitterAdapter.js'

vi.mock('../../src/middleware/logger.js', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

describe('LocalEventEmitterAdapter', () => {
  it('publishes an event through the event bus', async () => {
    const emitSafe = vi.fn()
    const adapter = new LocalEventEmitterAdapter({ emitSafe })
    await adapter.publish({ eventType: 'order.created' })
    expect(emitSafe).toHaveBeenCalledWith('order.created', { eventType: 'order.created' })
  })

  it('rethrows when the event bus publish fails', async () => {
    const emitSafe = vi.fn(() => { throw new Error('bus fail') })
    const adapter = new LocalEventEmitterAdapter({ emitSafe })
    await expect(adapter.publish({ eventType: 'x' })).rejects.toThrow('bus fail')
  })
})
