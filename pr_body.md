## Problem

`handleLocationPing` silently dropped location pings when `telemetryWriteBuffer` reached `MAX_BUFFER_SIZE` — it incremented counters but never told the driver. The WebSocket stayed open, no error was sent, and drivers assumed their location was accepted while their updates were discarded.

## Fix

When the buffer is at capacity, the server now sends a structured `503` error with a `retryAfter` hint and returns instead of silently dropping:

```javascript
if (telemetryWriteBuffer.length >= MAX_BUFFER_SIZE) {
  telemetryTotalDropped++;
  telemetryOverflowDropped++;
  ws.send(JSON.stringify({
    error: 'Telemetry buffer full, please retry in a few seconds',
    code: 503,
    retryAfter: 5,
  }));
  return;
}
```

## Files changed

- backend/api/src/sockets/tracker.js — `handleLocationPing`

## Testing

- Drivers now receive an explicit backpressure/backoff signal when telemetry is dropped due to a full buffer.

Closes #11401
