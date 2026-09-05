import type { SessionKind } from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { appendEntryLogIfAbsent } from './entry-log.service.js';
import { deriveSessionKindFromId } from './session.service.js';

export interface SessionResolutionOk {
  ok: true;
  sessionId: string;
  row: Record<string, string>;
}

export interface SessionResolutionFail {
  ok: false;
  code:
    | 'SESSION_REQUIRED'
    | 'SESSION_INVALID'
    | 'SESSION_EXPIRED'
    | 'SESSION_TERMINATED'
    | 'SESSION_FORBIDDEN';
}

export type SessionResolution = SessionResolutionOk | SessionResolutionFail;

/**
 * The one place a session cookie's value is turned into either "this
 * request may proceed" or a specific, safe failure reason. Used by resume,
 * heartbeat, and the Admin authorization middleware alike.
 *
 * Always reads 06_SESSIONS bypassing the cache — the general 60-second
 * Sheet cache must never delay noticing an expired or terminated session.
 *
 * Order matters: a session that is BOTH terminated and past its expiry is
 * reported as terminated (a human/Admin action takes precedence over the
 * passage of time), and a session whose kind doesn't match the cookie it
 * arrived on (only reachable by manually tampering with a cookie value,
 * since the two cookies are named and set separately) is reported as
 * SESSION_FORBIDDEN — a real, still-active session, just not authorized
 * for this kind of resource — distinct from the 401 cases above it.
 */
export async function resolveActiveSession(
  gateway: SheetGateway,
  requestedKind: SessionKind,
  sessionId: string | undefined,
  now: Date,
): Promise<SessionResolution> {
  if (!sessionId) {
    return { ok: false, code: 'SESSION_REQUIRED' };
  }

  const found = await gateway.findByPrimaryKey('06_SESSIONS', sessionId, { bypass: true });
  if (!found) {
    return { ok: false, code: 'SESSION_INVALID' };
  }

  const row = found.row.raw;
  const actualKind = deriveSessionKindFromId(sessionId);

  if (row.status === 'terminated') {
    await appendEntryLogIfAbsent(gateway, `log_session_terminated_${sessionId}`, {
      eventType: 'session_terminated',
      accessResult: 'rejected',
      timestamp: now.toISOString(),
      ip: row.ip_address ?? '',
      deviceId: row.device_id ?? '',
      userId: row.user_id ?? '',
      sessionId,
    });
    return { ok: false, code: 'SESSION_TERMINATED' };
  }

  const expiresAtMs = Date.parse(row.expires_at ?? '');
  const isPastExpiry = !Number.isFinite(expiresAtMs) || now.getTime() >= expiresAtMs;

  if (row.status === 'expired' || isPastExpiry) {
    if (row.status !== 'expired') {
      await gateway.updateByPrimaryKey('06_SESSIONS', sessionId, {
        status: 'expired',
        last_seen_at: now.toISOString(),
      });
    }
    await appendEntryLogIfAbsent(gateway, `log_session_expired_${sessionId}`, {
      eventType: 'session_expired',
      accessResult: 'rejected',
      timestamp: now.toISOString(),
      ip: row.ip_address ?? '',
      deviceId: row.device_id ?? '',
      userId: row.user_id ?? '',
      sessionId,
    });
    return { ok: false, code: 'SESSION_EXPIRED' };
  }

  if (actualKind !== requestedKind) {
    return { ok: false, code: 'SESSION_FORBIDDEN' };
  }

  if (row.status !== 'active') {
    return { ok: false, code: 'SESSION_INVALID' };
  }

  return { ok: true, sessionId, row };
}
