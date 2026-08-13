## Problem

`apply_order_event()` in `supabase/migrations/20260810000000_event_outbox_and_read_model.sql` upserts into `orders_read_model` with no monotonic version guard. Idempotency is only enforced on `(topic, event_id)`, so a redelivered/out-of-order event with an *older* version but a *different* `event_id` (the normal case) passes the conflict check and unconditionally overwrites the newer state. Stale events silently regress the single authoritative read model.

## Fix

- Added a `WHERE orders_read_model.version IS NULL OR excluded.version > orders_read_model.version` guard to the conflict update so only newer events are applied.
- `version` is now set to `excluded.version` (never silently kept stale via the coalesce).
- The `kafka_processed_events` idempotency insert runs before the upsert for every event, so genuine duplicates are still de-duplicated and the processed event is recorded even when the write is skipped.

## Files changed

- supabase/migrations/20260810000000_event_outbox_and_read_model.sql

## Testing

- Reasoned through out-of-order delivery: delivering v7 then v5 (different event_id) no longer overwrites v7; v5 then v7 still applies v7.
- Requires a Postgres instance to execute the function; no automated SQL harness exists in-repo.

Closes #11396
