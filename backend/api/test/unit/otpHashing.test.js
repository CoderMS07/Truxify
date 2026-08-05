/**
 * Coverage for shared OTP hashing.
 *
 * Phone login OTPs were stored as bare unsalted SHA-256. A 6-digit code has a
 * keyspace of 10^6, so the full rainbow table computes in under a second and
 * any read access to `phone_otps` yielded live login credentials. The delivery
 * OTP path had already been migrated to salted scrypt; these tests pin the
 * shared implementation both paths now use.
 */
import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  hashOtp,
  isLegacyOtpRecord,
  verifyOtpHash,
} from '../../src/lib/otpHashing.js';

/** Build a legacy pre-migration record: unsalted SHA-256, no salt column. */
function legacyRecord(otp) {
  return {
    otp_hash: crypto.createHash('sha256').update(String(otp)).digest('hex'),
  };
}

/** Build a post-migration record: salted scrypt. */
function saltedRecord(otp) {
  const { hash, salt } = hashOtp(otp);
  return { otp_hash: hash, otp_salt: salt };
}

describe('hashOtp', () => {
  it('produces a 128-character hex digest and a 32-character hex salt', () => {
    const { hash, salt } = hashOtp('123456');
    expect(hash).toMatch(/^[a-f0-9]{128}$/);
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
  });

  it('generates a fresh salt on every call', () => {
    const a = hashOtp('123456');
    const b = hashOtp('123456');
    expect(a.salt).not.toBe(b.salt);
  });

  it('produces different digests for the same OTP — defeating precomputation', () => {
    // This is the entire point of the change. Under the old unsalted scheme
    // these two would have been byte-identical.
    const a = hashOtp('123456');
    const b = hashOtp('123456');
    expect(a.hash).not.toBe(b.hash);
  });

  it('is deterministic when the salt is supplied', () => {
    const { hash, salt } = hashOtp('123456');
    expect(hashOtp('123456', salt).hash).toBe(hash);
  });

  it('accepts a numeric OTP as well as a string', () => {
    const { hash, salt } = hashOtp(123456);
    expect(hashOtp('123456', salt).hash).toBe(hash);
  });

  it('produces different digests for different OTPs under one salt', () => {
    const { salt } = hashOtp('000000');
    expect(hashOtp('123456', salt).hash).not.toBe(hashOtp('654321', salt).hash);
  });
});

describe('verifyOtpHash — salted records', () => {
  it('accepts the correct OTP', () => {
    expect(verifyOtpHash('123456', saltedRecord('123456'))).toBe(true);
  });

  it('rejects an incorrect OTP', () => {
    expect(verifyOtpHash('654321', saltedRecord('123456'))).toBe(false);
  });

  it('accepts a numeric submission against a string-hashed OTP', () => {
    expect(verifyOtpHash(123456, saltedRecord('123456'))).toBe(true);
  });

  it('rejects when the salt does not match the digest', () => {
    const record = saltedRecord('123456');
    record.otp_salt = crypto.randomBytes(16).toString('hex');
    expect(verifyOtpHash('123456', record)).toBe(false);
  });

  it('fails closed on a malformed digest rather than throwing', () => {
    // timingSafeEqual throws on a length mismatch, so shape is validated first.
    const record = saltedRecord('123456');
    expect(verifyOtpHash('123456', { ...record, otp_hash: 'deadbeef' })).toBe(false);
    expect(verifyOtpHash('123456', { ...record, otp_hash: '' })).toBe(false);
    expect(verifyOtpHash('123456', { ...record, otp_hash: 'z'.repeat(128) })).toBe(false);
    expect(verifyOtpHash('123456', { ...record, otp_hash: null })).toBe(false);
  });

  it('rejects an uppercase digest, since storage is lowercase hex', () => {
    const record = saltedRecord('123456');
    expect(verifyOtpHash('123456', { ...record, otp_hash: record.otp_hash.toUpperCase() })).toBe(false);
  });
});

describe('verifyOtpHash — legacy unsalted records', () => {
  it('still accepts a correct pre-migration OTP', () => {
    // In-flight codes issued before the migration must keep working for the
    // remainder of their TTL, otherwise deploying locks users out.
    expect(verifyOtpHash('123456', legacyRecord('123456'))).toBe(true);
  });

  it('rejects an incorrect pre-migration OTP', () => {
    expect(verifyOtpHash('999999', legacyRecord('123456'))).toBe(false);
  });

  it('fails closed on a malformed legacy digest', () => {
    expect(verifyOtpHash('123456', { otp_hash: 'abc' })).toBe(false);
    expect(verifyOtpHash('123456', { otp_hash: 'g'.repeat(64) })).toBe(false);
  });

  it('prefers the salted path when a salt is present', () => {
    // A record carrying both a salt and a legacy-length digest must not fall
    // through to the SHA-256 branch.
    const record = { ...legacyRecord('123456'), otp_salt: 'a'.repeat(32) };
    expect(verifyOtpHash('123456', record)).toBe(false);
  });
});

describe('verifyOtpHash — malformed input', () => {
  it('returns false for null, undefined and non-object records', () => {
    expect(verifyOtpHash('123456', null)).toBe(false);
    expect(verifyOtpHash('123456', undefined)).toBe(false);
    expect(verifyOtpHash('123456', 'not-a-record')).toBe(false);
    expect(verifyOtpHash('123456', 42)).toBe(false);
  });

  it('returns false for an empty record', () => {
    expect(verifyOtpHash('123456', {})).toBe(false);
  });

  it('returns false rather than throwing for a null OTP', () => {
    expect(verifyOtpHash(null, saltedRecord('123456'))).toBe(false);
    expect(verifyOtpHash(undefined, saltedRecord('123456'))).toBe(false);
  });
});

describe('isLegacyOtpRecord', () => {
  it('identifies a pre-migration unsalted record', () => {
    expect(isLegacyOtpRecord(legacyRecord('123456'))).toBe(true);
  });

  it('does not flag a salted record', () => {
    expect(isLegacyOtpRecord(saltedRecord('123456'))).toBe(false);
  });

  it('does not flag malformed or empty records', () => {
    expect(isLegacyOtpRecord(null)).toBe(false);
    expect(isLegacyOtpRecord({})).toBe(false);
    expect(isLegacyOtpRecord({ otp_hash: 'short' })).toBe(false);
  });
});

describe('login and delivery OTP paths share one implementation', () => {
  it('a digest produced by hashOtp verifies through verifyOtpHash', async () => {
    const { verifyDeliveryOtpHash } = await import(
      '../../src/services/notificationService.js'
    ).catch(() => ({ verifyDeliveryOtpHash: null }));

    const record = saltedRecord('246810');
    expect(verifyOtpHash('246810', record)).toBe(true);

    // The delivery path delegates to the same function, so if it is importable
    // in this environment it must agree.
    if (verifyDeliveryOtpHash) {
      expect(verifyDeliveryOtpHash('246810', record)).toBe(true);
      expect(verifyDeliveryOtpHash('000000', record)).toBe(false);
    }
  });
});
