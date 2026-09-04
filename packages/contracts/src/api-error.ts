export type ApiErrorCode =
  | 'not_found'
  | 'internal_error'
  | 'backend_not_configured'
  | 'invalid_request'
  | 'GOOGLE_CONFIG_NOT_FOUND'
  | 'GOOGLE_CONFIG_INVALID'
  | 'SHEET_ACCESS_DENIED'
  | 'SHEET_NOT_FOUND'
  | 'SHEET_TAB_MISSING'
  | 'SHEET_SCHEMA_INVALID'
  | 'SHEET_RATE_LIMITED'
  | 'SHEET_UNAVAILABLE'
  | 'DUPLICATE_PRIMARY_KEY'
  | 'ROW_NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'SHEET_WRITE_CONFLICT'
  | AccessErrorCode;

/**
 * Safe access/session error codes (M02). Never accompanied by a Gate code,
 * Admin password, session token contents, or any other access value — only
 * this typed code and a generic, non-identifying message.
 */
export type AccessErrorCode =
  | 'INVALID_GATE_CODE'
  | 'INVALID_ADMIN_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'SESSION_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_TERMINATED'
  | 'SESSION_INVALID'
  | 'ACCESS_CONFIG_INVALID'
  | 'ACCESS_SERVICE_UNAVAILABLE';

/** Structured error shape returned by backend endpoints instead of raw provider errors. */
export interface ApiError {
  ok: false;
  code: ApiErrorCode;
  message: string;
}
