## Problem

`GpsLog.create(...)` was fire-and-forget with only a `.catch()` that logged the error. Transient MongoDB failures (network blip, primary step-down, write-concern timeout) permanently lost the GPS record, and validation errors were never retried. There was no dead-letter queue and no way to replay failed writes, creating gaps in the GPS audit trail.

## Fix

- Added `persistGpsLogWithRetry(doc)` which retries `GpsLog.create` with exponential backoff (max 3 attempts: 100ms, 200ms, 400ms).
- On permanent failure, the document is pushed to a Redis dead-letter list (`gps_log_dlq`); if Redis is unavailable it is logged as permanently lost.
- Added `reconcileGpsLogDlq()` / `reconcileGpsLogDlqEntry()` which drain the DLQ and re-attempt writes, re-enqueuing up to `GPS_LOG_MAX_RETRIES` times before dropping.
- Added a `setInterval` (`gpsLogDlqReconcileInterval`, every 60s) that runs the reconciler, and cleared it in `closeWebSocketServer`.

## Files changed

- backend/api/src/sockets/tracker.js

## Testing

- Transient MongoDB failures now retry instead of losing the record.
- Permanently failing writes land in the `gps_log_dlq` Redis list for later replay.
- The reconciler re-attempts DLQ entries on a schedule.

Closes #11402
