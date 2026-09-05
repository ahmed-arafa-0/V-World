import type { ApiErrorCode } from '@veoullas-world/contracts';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(code: ApiErrorCode, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

export function httpStatusForCode(code: ApiErrorCode): number {
  switch (code) {
    case 'not_found':
    case 'SHEET_TAB_MISSING':
    case 'ROW_NOT_FOUND':
    case 'SHEET_NOT_FOUND':
      return 404;
    case 'invalid_request':
    case 'SHEET_SCHEMA_INVALID':
    case 'INVALID_REFERENCE':
      return 400;
    case 'SHEET_ACCESS_DENIED':
    case 'SESSION_FORBIDDEN':
      return 403;
    case 'backend_not_configured':
    case 'GOOGLE_CONFIG_NOT_FOUND':
    case 'GOOGLE_CONFIG_INVALID':
    case 'SHEET_UNAVAILABLE':
      return 503;
    case 'SHEET_RATE_LIMITED':
    case 'RATE_LIMITED':
      return 429;
    case 'DUPLICATE_PRIMARY_KEY':
    case 'SHEET_WRITE_CONFLICT':
      return 409;
    case 'INVALID_GATE_CODE':
    case 'INVALID_ADMIN_CREDENTIALS':
    case 'SESSION_REQUIRED':
    case 'SESSION_EXPIRED':
    case 'SESSION_TERMINATED':
    case 'SESSION_INVALID':
      return 401;
    case 'ACCESS_CONFIG_INVALID':
      return 500;
    case 'ACCESS_SERVICE_UNAVAILABLE':
      return 503;
    case 'internal_error':
    default:
      return 500;
  }
}

/**
 * Maps any thrown value to a safe, structured API error: never a stack trace,
 * raw Google error body, filesystem path, or credential fragment.
 */
export function toSafeApiError(err: unknown): {
  code: ApiErrorCode;
  message: string;
  httpStatus: number;
} {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, httpStatus: httpStatusForCode(err.code) };
  }
  return { code: 'internal_error', message: 'An unexpected error occurred.', httpStatus: 500 };
}
