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
  | 'WORLD_LOCKED'
  | 'WORLD_INVALID_STATE'
  | 'WORLD_CONTENT_UNAVAILABLE'
  | AccessErrorCode
  | MediaErrorCode;

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
  | 'SESSION_FORBIDDEN'
  | 'ACCESS_CONFIG_INVALID'
  | 'ACCESS_SERVICE_UNAVAILABLE';

/**
 * Safe media-gateway error codes (M03-B1). Never accompanied by a Drive file
 * ID, an authorization header/token, service-account data, or a raw Google
 * error — only this typed code and a generic, non-identifying message.
 */
export type MediaErrorCode =
  | 'MEDIA_ASSET_INVALID'
  | 'MEDIA_ASSET_NOT_FOUND'
  | 'MEDIA_ASSET_DISABLED'
  | 'MEDIA_VERSION_MISMATCH'
  | 'MEDIA_VARIANT_NOT_FOUND'
  | 'MEDIA_FILE_INACCESSIBLE'
  | 'MEDIA_FILE_OUTSIDE_ROOT'
  | 'MEDIA_SHORTCUT_REJECTED'
  | 'MEDIA_UNSUPPORTED_MIME'
  | 'MEDIA_RANGE_MALFORMED'
  | 'MEDIA_RANGE_NOT_SATISFIABLE'
  | 'MEDIA_UPSTREAM_UNAVAILABLE';

/** Structured error shape returned by backend endpoints instead of raw provider errors. */
export interface ApiError {
  ok: false;
  code: ApiErrorCode;
  message: string;
}
