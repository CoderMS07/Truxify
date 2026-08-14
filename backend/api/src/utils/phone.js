/**
 * Normalizes a phone number to E.164 format (e.g. +919876543210).
 * Returns null if the number cannot be parsed.
 *
 * Handles formats:
 *   +91 9876543210
 *   0919876543210
 *   9876543210
 *   919876543210
 *
 * @param {string} phone - Raw phone input.
 * @returns {string|null} E.164 normalized phone, or null if invalid.
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Handle the E.164 + prefix explicitly before stripping digits
  let digits = phone.replace(/[^\d]/g, '');

  // Check for Indian country code (91) before stripping leading 0.
  // This handles the case where the input includes both the trunk prefix
  // and the country code, e.g. 0919876543210.
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // Strip a leading trunk prefix 0 (e.g. 09876543210 -> 9876543210)
    digits = digits.slice(1);
  }

  // Validate: must be exactly 10 digits after country code removal
  if (digits.length !== 10) {
    return null;
  }

  // Validate all characters are digits
  if (!/^\d{10}$/.test(digits)) {
    return null;
  }

  // Return in E.164 format with +91 (India)
  return `+91${digits}`;
}
