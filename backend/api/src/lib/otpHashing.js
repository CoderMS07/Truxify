/**
 * Shared OTP hashing.
 *
 * A 6-digit OTP has a keyspace of 10^6. An unsalted digest of one is not a
 * meaningful protection: the complete rainbow table computes in well under a
 * second, so anyone with read access to the OTP table recovers every live
 * code. Salting per record makes precomputation useless, and scrypt's work
 * factor makes exhaustive search per record costly.
 *
 * This module is shared by the delivery-OTP path (`delivery_otps`) and the
 * phone login path (`phone_otps`) so the two cannot drift apart again — the
 * delivery path was migrated to salted scrypt while login was left on bare
 * SHA-256.
 */
import crypto from 'crypto';

/** Salt length in bytes. Hex-encoded on storage, so 32 characters. */
const SALT_BYTES = 16;

/** scrypt output length in bytes. Hex-encoded on storage, so 128 characters. */
const KEY_BYTES = 64;

/** A salted scrypt digest, hex-encoded. */
const SCRYPT_HASH_PATTERN = /^[a-f0-9]{128}$/;

/** A legacy unsalted SHA-256 digest, hex-encoded. */
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Hash an OTP with scrypt.
 *
 * @param {string|number} otp The plaintext OTP.
 * @param {string} [saltHex] Existing salt for verification, or undefined to
 *   generate a fresh one for storage.
 * @returns {{hash: string, salt: string}} Hex-encoded digest and salt.
 */
export function hashOtp(otp, saltHex) {
  const salt = saltHex || crypto.randomBytes(SALT_BYTES).toString('hex');
  const key = crypto.scryptSync(String(otp), salt, KEY_BYTES);
  return { hash: key.toString('hex'), salt };
}

/**
 * Timing-safe comparison of a submitted OTP against a stored record.
 *
 * Records written after the migration carry an `otp_salt` and are compared
 * with scrypt. Pre-migration rows have no salt and are compared with SHA-256,
 * so codes already in flight keep working for the remainder of their TTL
 * rather than locking users out at deploy time.
 *
 * Both branches use `crypto.timingSafeEqual`, and both validate the stored
 * digest's shape first — `timingSafeEqual` throws on a length mismatch, and a
 * malformed row must fail closed rather than raise.
 *
 * @param {string|number} otp The submitted OTP.
 * @param {{otp_hash?: string, otp_salt?: string}|null|undefined} otpRecord
 * @returns {boolean} True only on an exact match.
 */
export function verifyOtpHash(otp, otpRecord) {
  if (!otpRecord || typeof otpRecord !== 'object') {
    return false;
  }

  const expected = String(otpRecord.otp_hash || '');

  if (otpRecord.otp_salt) {
    if (!SCRYPT_HASH_PATTERN.test(expected)) {
      return false;
    }
    const { hash: submittedHash } = hashOtp(otp, otpRecord.otp_salt);
    return crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  // Legacy unsalted row, retained only for the TTL window of codes issued
  // before the migration. Remove this branch once that window has elapsed.
  if (LEGACY_SHA256_PATTERN.test(expected)) {
    const submittedHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  return false;
}

/**
 * Whether a stored record still uses the legacy unsalted format.
 *
 * Lets callers report how much legacy data remains so the fallback branch
 * above can be retired with evidence rather than guesswork.
 *
 * @param {{otp_hash?: string, otp_salt?: string}|null|undefined} otpRecord
 * @returns {boolean}
 */
export function isLegacyOtpRecord(otpRecord) {
  if (!otpRecord || typeof otpRecord !== 'object') {
    return false;
  }
  return !otpRecord.otp_salt && LEGACY_SHA256_PATTERN.test(String(otpRecord.otp_hash || ''));
}
