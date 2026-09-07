import { AppError } from '../errors/app-error.js';

interface GoogleApiErrorLike {
  code?: number;
  response?: { status?: number };
  message?: string;
}

function extractStatus(err: unknown): number | undefined {
  const e = err as GoogleApiErrorLike;
  return e?.response?.status ?? (typeof e?.code === 'number' ? e.code : undefined);
}

/**
 * Maps a raw googleapis Drive error to a safe `AppError`. Never forwards the
 * raw Google error body, headers, or message content that might embed a
 * Drive file ID or request detail — only a generic, sanitized description
 * plus a typed media error code. 401/403/404 all collapse to the same
 * "inaccessible" code so a caller can never distinguish "doesn't exist" from
 * "access denied" for a Drive file.
 */
export function mapDriveError(err: unknown): AppError {
  const status = extractStatus(err);

  if (status === 401 || status === 403 || status === 404) {
    return new AppError('MEDIA_FILE_INACCESSIBLE', 'The referenced media file is not accessible.');
  }
  if (status === 429) {
    return new AppError(
      'MEDIA_UPSTREAM_UNAVAILABLE',
      'The Google Drive API rate limit was exceeded.',
      {
        retryable: true,
      },
    );
  }
  if (status !== undefined && status >= 500) {
    return new AppError(
      'MEDIA_UPSTREAM_UNAVAILABLE',
      'The Google Drive API is temporarily unavailable.',
      { retryable: true },
    );
  }
  return new AppError('MEDIA_UPSTREAM_UNAVAILABLE', 'The Google Drive API request failed.');
}
