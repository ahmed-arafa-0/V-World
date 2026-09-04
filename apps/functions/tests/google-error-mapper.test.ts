import { describe, expect, it } from 'vitest';
import { mapGoogleError } from '../src/google/google-error-mapper.js';
import { AppError } from '../src/errors/app-error.js';

describe('mapGoogleError', () => {
  it('maps 401/403 to SHEET_ACCESS_DENIED (not retryable)', () => {
    const err = mapGoogleError({ response: { status: 403 } });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('SHEET_ACCESS_DENIED');
    expect(err.retryable).toBe(false);
  });

  it('maps 404 to SHEET_NOT_FOUND (not retryable)', () => {
    const err = mapGoogleError({ code: 404 });
    expect(err.code).toBe('SHEET_NOT_FOUND');
    expect(err.retryable).toBe(false);
  });

  it('maps 429 to SHEET_RATE_LIMITED (retryable)', () => {
    const err = mapGoogleError({ response: { status: 429 } });
    expect(err.code).toBe('SHEET_RATE_LIMITED');
    expect(err.retryable).toBe(true);
  });

  it('maps 5xx to SHEET_UNAVAILABLE (retryable)', () => {
    const err = mapGoogleError({ response: { status: 503 } });
    expect(err.code).toBe('SHEET_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('never forwards the raw Google error body', () => {
    const err = mapGoogleError({
      response: { status: 403, data: { error: { message: 'super secret internal detail' } } },
    });
    expect(err.message).not.toContain('super secret internal detail');
  });

  it('falls back to a generic unavailable error for unrecognized shapes', () => {
    const err = mapGoogleError(new Error('network exploded'));
    expect(err.code).toBe('SHEET_UNAVAILABLE');
  });
});
