import { describe, it, expect } from "vitest";
import { AuthorizationError } from "../../src/core/auth/AuthorizationError.js";

describe('AuthorizationError', () => {
  it('creates error with status 401 and inferred code UNAUTHENTICATED', () => {
    const err = new AuthorizationError(401, 'Not authenticated');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Not authenticated');
    expect(err.name).toBe('AuthorizationError');
    expect(err.errorCode).toBe('UNAUTHENTICATED');
  });

  it('creates error with status 403 and inferred code FORBIDDEN', () => {
    const err = new AuthorizationError(403, 'Access denied');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Access denied');
    expect(err.errorCode).toBe('FORBIDDEN');
  });

  it('creates error with custom errorCode', () => {
    const err = new AuthorizationError(403, 'Role not allowed', 'ROLE_NOT_ALLOWED');
    expect(err.errorCode).toBe('ROLE_NOT_ALLOWED');
  });

  it('creates error with 500 status and default code', () => {
    const err = new AuthorizationError(500, 'Unknown error');
    expect(err.status).toBe(500);
    expect(err.errorCode).toBe('AUTHORIZATION_ERROR');
  });

  it('toJSON returns correct shape', () => {
    const err = new AuthorizationError(403, 'Denied', 'ROLE_NOT_ALLOWED');
    const json = err.toJSON();
    expect(json).toEqual({
      error: 'Denied',
      errorCode: 'ROLE_NOT_ALLOWED',
      status: 403,
    });
  });

  it('is an instance of Error', () => {
    const err = new AuthorizationError(401, 'Not auth');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthorizationError);
  });

  it('passes Error message through super()', () => {
    const err = new AuthorizationError(401, 'Missing token');
    expect(err.message).toBe('Missing token');
  });
});
