export type ApiErrorCode =
  'not_found' | 'internal_error' | 'backend_not_configured' | 'invalid_request';

/** Structured error shape returned by backend endpoints instead of raw provider errors. */
export interface ApiError {
  ok: false;
  code: ApiErrorCode;
  message: string;
}
