/**
 * Safely escapes special regular expression characters in user-supplied strings.
 * Prevents ReDoS (Regular Expression Denial of Service) and regex injection.
 *
 * @param {string} str - Raw string input from user query or body
 * @returns {string} Escaped string safe for use inside new RegExp(...)
 */
export function escapeRegExp(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default escapeRegExp;
