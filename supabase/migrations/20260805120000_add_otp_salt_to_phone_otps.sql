-- Add a per-record salt to phone login OTPs.
--
-- phone_otps.otp_hash was written as a bare, unsalted SHA-256 digest. A
-- 6-digit OTP has a keyspace of 10^6, so the complete rainbow table computes
-- in under a second — any read access to this table yielded live login codes.
-- The delivery_otps table was already migrated to salted scrypt; this brings
-- the login path in line.
--
-- The column is nullable on purpose. Rows written before this migration have
-- no salt and are verified through the legacy SHA-256 branch in
-- src/lib/otpHashing.js for the remainder of their TTL, so codes already in
-- flight are not invalidated at deploy time.

BEGIN;

ALTER TABLE public.phone_otps
  ADD COLUMN IF NOT EXISTS otp_salt text;

COMMENT ON COLUMN public.phone_otps.otp_salt IS
  'Hex-encoded 16-byte scrypt salt. NULL only for pre-migration rows, which '
  'verify via the legacy unsalted SHA-256 path until they expire.';

-- Lookups filter on (phone, verified, expires_at) and take the newest row.
CREATE INDEX IF NOT EXISTS idx_phone_otps_lookup
  ON public.phone_otps (phone, verified, expires_at DESC);

-- Supports cleanup of expired rows without scanning the table.
CREATE INDEX IF NOT EXISTS idx_phone_otps_expires_at
  ON public.phone_otps (expires_at);

COMMIT;
