-- Migration: Enforce one-time release transaction per order (escrow webhook hardening)
-- ---------------------------------------------------------------------------------
-- Problem: a PaymentReleased / WithdrawalReady / Withdrawn webhook could previously
-- record the same release_tx_hash against multiple orders (replay), or overwrite
-- an already-released order. The wallet payout is exactly-once only because
-- complete_trip_tx is idempotent — but the escrow_status='released' write that
-- precedes the payout must itself be replay-proof.
--
-- Solution: a unique partial index on the normalized (lowercased) release
-- transaction hash. It binds an on-chain release transaction to at most one
-- order, so the DLQ/webhook layer fails permanently (TX_HASH_REPLAY) rather than
-- paying out a second driver.
--
-- The index is case-insensitive (LOWER) and partial (only non-null hashes) so:
--   * mixed-case hashes from legacy/foreign integrations still collide correctly
--   * orders that never reached escrow release are unaffected
--
-- Pre-flight guard: if existing data already contains duplicate hashes, the
-- migration fails loudly and must be resolved manually (each release tx belongs
-- to exactly one order).

do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select lower(release_tx_hash) as tx
    from orders
    where release_tx_hash is not null
    group by lower(release_tx_hash)
    having count(*) > 1
  ) d;

  if duplicate_count > 0 then
    raise exception
      'Cannot enforce unique release_tx_hash: % order(s) share a release transaction hash. Resolve the duplicates before applying this migration.',
      duplicate_count;
  end if;
end $$;

create unique index if not exists idx_orders_release_tx_hash_unique
  on orders (lower(release_tx_hash))
  where release_tx_hash is not null;
