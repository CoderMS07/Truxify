import { describe, it, expect } from 'vitest';
import { hashOtp, verifyOtpHash, constantTimeEqualHex } from '../../src/lib/otpHashing.js';

describe('otpHashing', () => {
  describe('hashOtp', () => {
    it('throws TypeError when OTP is null or empty', () => {
      expect(() => hashOtp('')).toThrow(TypeError);
      expect(() => hashOtp(null)).toThrow(TypeError);
    });

    it('throws TypeError when OTP is undefined', () => {
      expect(() => hashOtp(undefined)).toThrow(TypeError);
    });

    it('throws TypeError when OTP is whitespace-only', () => {
      expect(() => hashOtp('   ')).toThrow(TypeError);
    });

    it('returns hash and salt when given a valid OTP', () => {
      const result = hashOtp('123456');
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('salt');
      expect(result.hash.length).toBe(128); // 64 bytes hex = 128 chars
      expect(result.salt.length).toBe(32);  // 16 bytes hex = 32 chars
    });

    it('returns consistent hash for same OTP and salt', () => {
      const result1 = hashOtp('654321', 'fixedsalt00000000000000000');
      const result2 = hashOtp('654321', 'fixedsalt00000000000000000');
      expect(result1.hash).toBe(result2.hash);
      expect(result1.salt).toBe('fixedsalt00000000000000000');
    });

    it('uses custom salt when provided', () => {
      const result = hashOtp('123456', 'abcd1234abcd1234abcd1234abcd1234');
      expect(result.salt).toBe('abcd1234abcd1234abcd1234abcd1234');
    });

    it('produces different hash for different salts', () => {
      const result1 = hashOtp('999999', 'aaa000000000000000000000000000000');
      const result2 = hashOtp('999999', 'bbb000000000000000000000000000000');
      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe('verifyOtpHash', () => {
    it('returns false when otpRecord is null', () => {
      expect(verifyOtpHash('123456', null)).toBe(false);
    });

    it('returns false when otpRecord is undefined', () => {
      expect(verifyOtpHash('123456', undefined)).toBe(false);
    });

    it('returns false when otpRecord has no salt or hash', () => {
      expect(verifyOtpHash('123456', {})).toBe(false);
    });

    it('verifies a correct scrypt OTP hash', () => {
      const { hash, salt } = hashOtp('123456', 'testsalt0000000000000000');
      const result = verifyOtpHash('123456', { otp_hash: hash, otp_salt: salt });
      expect(result).toBe(true);
    });

    it('returns false for incorrect OTP with valid record', () => {
      const { hash, salt } = hashOtp('123456', 'testsalt0000000000000000');
      const result = verifyOtpHash('000000', { otp_hash: hash, otp_salt: salt });
      expect(result).toBe(false);
    });

    it('returns false when otp_hash is malformed (not 128 hex chars)', () => {
      expect(verifyOtpHash('123456', { otp_hash: 'abc', otp_salt: 'testsalt0000000000000000' })).toBe(false);
    });

    it('returns false for invalid SHA256 hash format', () => {
      expect(verifyOtpHash('123456', { otp_hash: 'not-hex' })).toBe(false);
    });
  });

  describe('constantTimeEqualHex', () => {
    it('returns true for equal hex strings', () => {
      expect(constantTimeEqualHex('deadbeef', 'deadbeef')).toBe(true);
    });

    it('returns false for different hex strings', () => {
      expect(constantTimeEqualHex('deadbeef', 'cafebabe')).toBe(false);
    });

    it('returns false for different length strings', () => {
      expect(constantTimeEqualHex('dead', 'deadbeef')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(constantTimeEqualHex(null, 'deadbeef')).toBe(false);
      expect(constantTimeEqualHex('deadbeef', null)).toBe(false);
      expect(constantTimeEqualHex(123, 'deadbeef')).toBe(false);
    });

    it('returns false for invalid hex characters', () => {
      expect(constantTimeEqualHex('deadbeeg', 'deadbeef')).toBe(false);
    });

    it('returns true for two empty strings', () => {
      expect(constantTimeEqualHex('', '')).toBe(true);
    });
  });
});
