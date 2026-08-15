-- ============================================================================
-- OUTBOX DEAD-LETTER QUEUE — outbox_dlq Table
-- ============================================================================
-- Outbox events that exhaust their retry budget (retry_count >= MAX_RETRIES)
-- were previously left in a terminal `failed` state with no consumer and no
-- path to recovery, causing silent, unrecoverable event loss (issue #14693).
-- This migration creates `outbox_dlq`, a durable dead-letter store mirroring
-- outbox_events plus the metadata needed for manual/automated replay.
--
-- SECURITY MODEL:
--   - Written and read only by backend services using the service-role admin
--     client (see backend/api/src/services/outbox/outboxService.js) and never
--     exposed to clients, so RLS allows service_role only and anon/
--     authenticated have no grants (mirrors kafka_dead_letters).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. DEAD-LETTER TABLE
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists outbox_dlq (
  id               uuid primary key default gen_random_uuid(),
  original_id      uuid,                  -- id of the source outbox_events row
  aggregate_id     text not null,
  aggregate_type   text not null default 'order',
  event_type       text not null,
  payload          jsonb not null default '{}',
  last_error       text,
  retry_count      integer not null default 0,
  last_attempted_at timestamptz,
  created_at       timestamptz not null default now(),
  dead_lettered_at timestamptz not null default now(),
  status           text not null default 'pending'  -- pending | replayed
);

create index if not exists idx_outbox_dlq_status
  on outbox_dlq (status);

create index if not exists idx_outbox_dlq_aggregate
  on outbox_dlq (aggregate_id, aggregate_type);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────
alter table outbox_dlq enable row level security;

drop policy if exists "Service role full access on outbox_dlq"
  on outbox_dlq;
create policy "Service role full access on outbox_dlq"
  on outbox_dlq
  for all to service_role
  using (true)
  with check (true);

revoke all on table outbox_dlq from anon, authenticated;
