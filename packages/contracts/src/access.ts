import type { AccessErrorCode } from './api-error.js';

/**
 * M02 access/session contracts. These types describe the shapes the backend
 * exchanges with React for Veoulla's Gate entry, Admin login, and session
 * lifecycle. They must never carry a Sheet access-column name, the current
 * Gate value, the Admin password, Google credentials, a raw Sheet row, a
 * private key, or any other secret value — only sanitized, typed data.
 */

export type SessionKind = 'owner' | 'admin';

export type SessionStatus = 'active' | 'expired' | 'terminated';

/** Safe, non-secret summary of a session — never includes a Gate code or Admin password. */
export interface SafeSessionSummary {
  sessionId: string;
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
}

export interface RateLimitedResponse {
  ok: false;
  code: 'RATE_LIMITED';
  message: string;
  rateLimit: RateLimitState;
}

// --- Gate (owner) login -----------------------------------------------------

export interface GateLoginRequest {
  /** Four-digit attempt submitted from the dials; never echoed back. */
  code: string;
  deviceId?: string;
  language?: string;
}

export interface GateLoginSuccess {
  ok: true;
  session: SafeSessionSummary;
}

export interface GateLoginFailure {
  ok: false;
  code: Extract<AccessErrorCode, 'INVALID_GATE_CODE' | 'RATE_LIMITED'>;
  message: string;
  rateLimit?: RateLimitState;
}

export type GateLoginResult = GateLoginSuccess | GateLoginFailure;

// --- Admin login -------------------------------------------------------------

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminLoginSuccess {
  ok: true;
  session: SafeSessionSummary;
}

export interface AdminLoginFailure {
  ok: false;
  code: Extract<AccessErrorCode, 'INVALID_ADMIN_CREDENTIALS' | 'RATE_LIMITED'>;
  message: string;
  rateLimit?: RateLimitState;
}

export type AdminLoginResult = AdminLoginSuccess | AdminLoginFailure;

// --- Session lifecycle --------------------------------------------------------

export interface SessionResumeRequest {
  sessionId: string;
}

export interface SessionLifecycleFailure {
  ok: false;
  code: Extract<
    AccessErrorCode,
    'SESSION_REQUIRED' | 'SESSION_EXPIRED' | 'SESSION_TERMINATED' | 'SESSION_INVALID'
  >;
  message: string;
}

export type SessionResumeResult =
  { ok: true; session: SafeSessionSummary } | SessionLifecycleFailure;

export interface SessionHeartbeatRequest {
  sessionId: string;
}

/** Heartbeat keeps a session marked active but never extends its absolute expiry. */
export type SessionHeartbeatResult =
  { ok: true; session: SafeSessionSummary } | SessionLifecycleFailure;

export interface SessionLogoutRequest {
  sessionId: string;
}

export type SessionLogoutResult = { ok: true } | SessionLifecycleFailure;

// --- Entry logging -------------------------------------------------------------

export interface PageOpenEvent {
  language?: string;
  route?: string;
  deviceId?: string;
}

export type PageOpenResult =
  { ok: true; logId: string } | { ok: false; code: AccessErrorCode; message: string };
