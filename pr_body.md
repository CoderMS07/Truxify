## Problem

`handleTrackingMessage` called `isMessageRateLimited(ws)` and returned immediately when the limit was exceeded. The client received nothing — no error frame, no close code, no `retryAfter` hint — so messages silently disappeared and clients couldn't distinguish rate limiting from a network issue or server bug.

## Fix

When rate-limited, the server now sends a structured `429` error before returning:

```javascript
ws.send(JSON.stringify({
  error: 'Rate limit exceeded: too many messages per second',
  code: 429,
  retryAfter: 1,
}));
```

## Files changed

- backend/api/src/sockets/tracker.js — `handleTrackingMessage`

## Testing

- Rate-limited clients now receive a `429` structured error with a `retryAfter` hint instead of a silent drop.

Closes #11400
