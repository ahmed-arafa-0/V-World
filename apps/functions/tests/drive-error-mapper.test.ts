import { describe, expect, it } from 'vitest';
import { mapDriveError } from '../src/google/drive-error-mapper.js';
import { AppError } from '../src/errors/app-error.js';

describe('mapDriveError', () => {
  it('maps 401 to MEDIA_FILE_INACCESSIBLE (not retryable)', () => {
    const err = mapDriveError({ response: { status: 401 } });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('MEDIA_FILE_INACCESSIBLE');
    expect(err.retryable).toBe(false);
  });

  it('maps 403 to MEDIA_FILE_INACCESSIBLE (not retryable)', () => {
    const err = mapDriveError({ response: { status: 403 } });
    expect(err.code).toBe('MEDIA_FILE_INACCESSIBLE');
    expect(err.retryable).toBe(false);
  });

  it('maps 404 to MEDIA_FILE_INACCESSIBLE (not retryable) — never distinguishable from 401/403', () => {
    const err = mapDriveError({ code: 404 });
    expect(err.code).toBe('MEDIA_FILE_INACCESSIBLE');
    expect(err.retryable).toBe(false);
  });

  it('maps 429 to MEDIA_UPSTREAM_UNAVAILABLE (retryable)', () => {
    const err = mapDriveError({ response: { status: 429 } });
    expect(err.code).toBe('MEDIA_UPSTREAM_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('maps 5xx to MEDIA_UPSTREAM_UNAVAILABLE (retryable)', () => {
    const err = mapDriveError({ response: { status: 503 } });
    expect(err.code).toBe('MEDIA_UPSTREAM_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('never forwards the raw Google error body or a Drive file ID hint', () => {
    const err = mapDriveError({
      response: {
        status: 403,
        data: { error: { message: 'file 1AbCFileIdSecret is restricted' } },
      },
    });
    expect(err.message).not.toContain('1AbCFileIdSecret');
  });

  it('falls back to a generic unavailable error for unrecognized shapes', () => {
    const err = mapDriveError(new Error('network exploded'));
    expect(err.code).toBe('MEDIA_UPSTREAM_UNAVAILABLE');
    expect(err.retryable).toBe(false);
  });
});
