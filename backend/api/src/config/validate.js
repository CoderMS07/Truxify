/**
 * Startup configuration validation.
 *
 * Checks that all required environment variables are present and non-empty
 * before the application starts accepting requests. Fail-fast with a
 * clear error message instead of cryptic runtime errors deep in the call
 * stack.
 *
 * Call validateConfig() early in the startup sequence (before connecting to
 * external services) to ensure the environment is correctly configured.
 */

import logger from '../middleware/logger.js';

/**
 * @typedef {Object} ConfigVar
 * @property {string} name - The environment variable name.
 * @property {string} description - Human-readable description for error messages.
 */

/** @type {ConfigVar[]} */
const REQUIRED_VARS = [
  { name: 'SUPABASE_URL', description: 'Supabase project URL' },
  { name: 'SUPABASE_ANON_KEY', description: 'Supabase anonymous (public) key' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase service role key (server-only)' },
];

/** @type {ConfigVar[]} */
const RECOMMENDED_VARS = [
  { name: 'REDIS_URL', description: 'Redis connection URL (required for caching and rate limiting)' },
  { name: 'JWT_SECRET', description: 'JWT signing secret (required for token verification)' },
  { name: 'SENTRY_DSN', description: 'Sentry DSN for error reporting' },
];

/**
 * Validate a single environment variable.
 * @param {string} name
 * @returns {boolean} True if the variable is set and non-empty.
 */
function isSet(name) {
  return Boolean(process.env[name] && process.env[name].trim().length > 0);
}

/**
 * Validate the configuration and exit with a clear error if any required
 * variables are missing.
 *
 * @param {Object} [options]
 * @param {boolean} [options.exitOnFailure=true] - Call process.exit(1) on validation failure.
 * @returns {{ valid: boolean, missing: string[], warnings: string[] }}
 */
export function validateConfig({ exitOnFailure = true } = {}) {
  const missing = [];

  for (const { name, description } of REQUIRED_VARS) {
    if (!isSet(name)) {
      logger.error(`[config] Required environment variable ${name} (${description}) is not set.`);
      missing.push(name);
    }
  }

  const warnings = [];
  for (const { name, description } of RECOMMENDED_VARS) {
    if (!isSet(name)) {
      logger.warn(`[config] Recommended environment variable ${name} (${description}) is not set. Some features may not work correctly.`);
      warnings.push(name);
    }
  }

  const valid = missing.length === 0;

  if (!valid) {
    logger.error(`[config] Configuration validation failed. Missing required variables: ${missing.join(', ')}. Set these variables and restart the server.`);
    if (exitOnFailure) {
      process.exit(1);
    }
  } else {
    logger.info('[config] Configuration validation passed.');
  }

  return { valid, missing, warnings };
}

export default validateConfig;
