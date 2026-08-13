## Problem

`messageRateTracker` was a `WeakMap` keyed by the `ws` object. Because `WeakMap` entries are removed only when the key is garbage collected, rate-limit state for closed sockets lingered until non-deterministic GC, could not be inspected or bounded, and a high-rate socket whose cleanup was delayed could effectively bypass limits.

## Fix

- Replaced the `WeakMap` with a regular `Map` keyed by `ws.socketId` (already generated per connection).
- `isMessageRateLimitedInMemory` now stores/looks up state by `socketId`.
- Added explicit `messageRateTracker.delete(ws.socketId)` in `removeClientFromAllSubscriptions` on disconnect.
- Added `sweepMessageRateTracker()` plus a `setInterval` (`messageRateTrackerCleanupInterval`, every 30s) that deletes entries whose 1s window has expired, and cleared the interval in `closeWebSocketServer`.

## Files changed

- backend/api/src/sockets/tracker.js

## Testing

- Closed sockets no longer retain rate-limit state.
- The map is bounded via explicit delete + periodic sweep.

Closes #11399
