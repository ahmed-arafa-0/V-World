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
 * Maps a raw googleapis error to a safe AppError. Never forwards the raw
 * Google error body, headers, or message content that might embed request
 * details — only a generic, sanitized description plus a typed code.
 */
export function mapGoogleError(err: unknown): AppError {
  const status = extractStatus(err);

  if (status === 401 || status === 403) {
    return new AppError(
      'SHEET_ACCESS_DENIED',
      'The backend service account was denied access to the Sheet.',
    );
  }
  if (status === 404) {
    return new AppError(
      'SHEET_NOT_FOUND',
      'The configured spreadsheet or range could not be found.',
    );
  }
  if (status === 429) {
    return new AppError('SHEET_RATE_LIMITED', 'The Google Sheets API rate limit was exceeded.', {
      retryable: true,
    });
  }
  if (status !== undefined && status >= 500) {
    return new AppError('SHEET_UNAVAILABLE', 'The Google Sheets API is temporarily unavailable.', {
      retryable: true,
    });
  }
  return new AppError('SHEET_UNAVAILABLE', 'The Google Sheets API request failed.');
}
