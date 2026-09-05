import type { AccessErrorCode } from './api-error.js';

/**
 * M02 access/session contracts. These types describe the shapes the backend
 * exchanges with React for Veoulla's Gate entry, Admin login, and session
 * lifecycle. They must never carry a Sheet access-column name, the current
 * Gate value, the Admin password, Google credentials, a raw Sheet row, a
 * private key, or any other secret value — only sanitized, typed data.
 *
 * Session identity travels only in an HttpOnly cookie, never in a JSON
 * response or request body — `SafeSessionSummary` deliberately has no
 * session ID field, and every session-lifecycle request below is
 * transported by cookie, not by a client-supplied session ID.
 */

export type SessionKind = 'owner' | 'admin';

export type SessionStatus = 'active' | 'expired' | 'terminated';

/** Safe, non-secret summary of a session — never a Gate code, Admin password, or the session ID itself. */
export interface SafeSessionSummary {
  kind: SessionKind;
  userId: string;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

/** Attempt/cooldown state safe to show in the UI — never the underlying code or password. */
export interface RateLimitState {
  maxAttempts: number;
  remainingAttempts: number;
  cooldownSeconds: number;
  /** ISO timestamp the current cooldown ends, or null when not currently cooling down. */
  cooldownEndsAt: string | null;
  /** Seconds until the client may retry, or null when not currently cooling down. */
  retryAfterSeconds: number | null;
}

export interface RateLimitedResponse {
  ok: false;
  code: 'RATE_LIMITED';
  message: string;
  rateLimit: RateLimitState;
}

// --- Gate (owner) login -----------------------------------------------------

export interface GateLoginRequest {
  /** Exactly four single-digit dial values ("0"–"9" each), never a combined code string. */
  digits: string[];
  deviceId: string;
  language?: string;
  /** Stable client-generated ID; a retry with the same ID reuses its original result. */
  attemptId: string;
}

export interface GateLoginSuccess {
  ok: true;
  session: SafeSessionSummary;
}

export interface GateLoginFailure {
  ok: false;
  code: Extract<AccessErrorCode, 'INVALID_GATE_CODE' | 'RATE_LIMITED'> | 'invalid_request';
  message: string;
  rateLimit?: RateLimitState;
}

export type GateLoginResult = GateLoginSuccess | GateLoginFailure;

// --- Admin login -------------------------------------------------------------

export interface AdminLoginRequest {
  username: string;
  password: string;
  deviceId: string;
  language?: string;
  /** Stable client-generated ID; a retry with the same ID reuses its original result. */
  attemptId: string;
}

export interface AdminLoginSuccess {
  ok: true;
  session: SafeSessionSummary;
}

export interface AdminLoginFailure {
  ok: false;
  code: Extract<AccessErrorCode, 'INVALID_ADMIN_CREDENTIALS' | 'RATE_LIMITED'> | 'invalid_request';
  message: string;
  rateLimit?: RateLimitState;
}

export type AdminLoginResult = AdminLoginSuccess | AdminLoginFailure;

// --- Session lifecycle --------------------------------------------------------

/** Resume is transported by cookie; `resumeOperationId` only dedupes the session_resume audit log. */
export interface SessionResumeRequest {
  resumeOperationId?: string;
}

export interface SessionLifecycleFailure {
  ok: false;
  code: Extract<
    AccessErrorCode,
    | 'SESSION_REQUIRED'
    | 'SESSION_EXPIRED'
    | 'SESSION_TERMINATED'
    | 'SESSION_INVALID'
    | 'SESSION_FORBIDDEN'
  >;
  message: string;
}

export type SessionResumeResult =
  { ok: true; session: SafeSessionSummary } | SessionLifecycleFailure;

export type SessionHeartbeatResult =
  { ok: true; session: SafeSessionSummary } | SessionLifecycleFailure;

export type SessionLogoutResult = { ok: true };

// --- Entry logging -------------------------------------------------------------

export interface PageOpenEvent {
  /** Stable client-generated ID; one operation ID creates exactly one log row. */
  operationId: string;
  language?: string;
  route?: string;
  deviceId?: string;
}

export type PageOpenResult =
  | { ok: true; logId: string }
  | { ok: false; code: 'invalid_request' | 'ACCESS_SERVICE_UNAVAILABLE'; message: string };
