import type { Request, Response } from 'express';
import type {
  ApiError,
  SessionHeartbeatResult,
  SessionKind,
  SessionLogoutResult,
  SessionResumeResult,
} from '@veoullas-world/contracts';
import { httpStatusForCode } from '../errors/app-error.js';
import { clearSessionCookie, readSessionCookie, type CookieEnv } from '../http/cookies.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { appendEntryLogIfAbsent } from '../services/entry-log.service.js';
import { resolveActiveSession } from '../services/session-resolution.service.js';
import { toSafeSessionSummary, touchLastSeen } from '../services/session.service.js';

const GENERIC_SESSION_MESSAGES: Record<string, string> = {
  SESSION_REQUIRED: 'A session is required.',
  SESSION_INVALID: 'Session is invalid.',
  SESSION_EXPIRED: 'Session has expired.',
  SESSION_TERMINATED: 'Session has been terminated.',
  SESSION_FORBIDDEN: 'Not authorized for this resource.',
};

function backendNotConfigured(res: Response): void {
  const error: ApiError = {
    ok: false,
    code: 'backend_not_configured',
    message: 'Google Sheets backend is not configured.',
  };
  res.status(503).json(error);
}

/**
 * GET /api/session/owner | /api/session/admin — resume. Reads the
 * corresponding HttpOnly cookie, validates the live (uncached) Sheet
 * session, updates `last_seen_at` (never `expires_at`), and logs
 * `session_resume` idempotently once per supplied `resumeOperationId` (or a
 * once-per-day default when the caller doesn't supply one).
 */
export function createSessionResumeHandler(
  kind: SessionKind,
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      backendNotConfigured(res);
      return;
    }

    const sessionId = readSessionCookie(req, kind);
    const currentTime = now();
    const resolution = await resolveActiveSession(gateway, kind, sessionId, currentTime);

    if (!resolution.ok) {
      clearSessionCookie(res, kind, cookieEnv());
      const result: SessionResumeResult = {
        ok: false,
        code: resolution.code,
        message: GENERIC_SESSION_MESSAGES[resolution.code] ?? 'Session error.',
      };
      res.status(httpStatusForCode(resolution.code)).json(result);
      return;
    }

    await touchLastSeen(gateway, resolution.sessionId, currentTime);

    const resumeOperationId =
      typeof req.query.resumeOperationId === 'string' &&
      req.query.resumeOperationId.trim().length > 0
        ? req.query.resumeOperationId
        : `default_${resolution.sessionId}_${currentTime.toISOString().slice(0, 10)}`;

    await appendEntryLogIfAbsent(gateway, `log_session_resume_${kind}_${resumeOperationId}`, {
      eventType: 'session_resume',
      accessResult: 'success',
      timestamp: currentTime.toISOString(),
      ip: resolution.row.ip_address ?? '',
      deviceId: resolution.row.device_id ?? '',
      userId: resolution.row.user_id ?? '',
      sessionId: resolution.sessionId,
    });

    const summary = toSafeSessionSummary(
      { ...resolution.row, last_seen_at: currentTime.toISOString() },
      kind,
    );
    const result: SessionResumeResult = { ok: true, session: summary };
    res.status(200).json(result);
  };
}

/**
 * POST /api/session/owner/heartbeat | /api/session/admin/heartbeat.
 * Updates `last_seen_at` only — never `expires_at`, and never appends an
 * Entry Log (a heartbeat is not an audit event). Concurrent duplicate
 * updates for the same session are naturally serialized by the gateway's
 * per-row write mutex, so a retry is always safe.
 */
export function createSessionHeartbeatHandler(
  kind: SessionKind,
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      backendNotConfigured(res);
      return;
    }

    const sessionId = readSessionCookie(req, kind);
    const currentTime = now();
    const resolution = await resolveActiveSession(gateway, kind, sessionId, currentTime);

    if (!resolution.ok) {
      clearSessionCookie(res, kind, cookieEnv());
      const result: SessionHeartbeatResult = {
        ok: false,
        code: resolution.code,
        message: GENERIC_SESSION_MESSAGES[resolution.code] ?? 'Session error.',
      };
      res.status(httpStatusForCode(resolution.code)).json(result);
      return;
    }

    await touchLastSeen(gateway, resolution.sessionId, currentTime);

    const summary = toSafeSessionSummary(
      { ...resolution.row, last_seen_at: currentTime.toISOString() },
      kind,
    );
    const result: SessionHeartbeatResult = { ok: true, session: summary };
    res.status(200).json(result);
  };
}

/**
 * DELETE /api/session/owner | /api/session/admin — logout. Marks only the
 * selected kind's active session `terminated`, appends `session_end`
 * exactly once, and always clears that cookie. Returns success even when
 * the cookie is already absent or the session was already terminated,
 * without revealing any prior session data.
 */
export function createSessionLogoutHandler(
  kind: SessionKind,
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      backendNotConfigured(res);
      return;
    }

    const sessionId = readSessionCookie(req, kind);
    const result: SessionLogoutResult = { ok: true };

    if (!sessionId) {
      clearSessionCookie(res, kind, cookieEnv());
      res.status(200).json(result);
      return;
    }

    const currentTime = now();
    const found = await gateway.findByPrimaryKey('06_SESSIONS', sessionId, { bypass: true });

    if (found) {
      if (found.row.raw.status === 'active') {
        await gateway.updateByPrimaryKey('06_SESSIONS', sessionId, {
          status: 'terminated',
          last_seen_at: currentTime.toISOString(),
        });
      }
      await appendEntryLogIfAbsent(gateway, `log_session_end_${kind}_${sessionId}`, {
        eventType: 'session_end',
        accessResult: 'success',
        timestamp: currentTime.toISOString(),
        ip: found.row.raw.ip_address ?? '',
        deviceId: found.row.raw.device_id ?? '',
        userId: found.row.raw.user_id ?? '',
        sessionId,
      });
    }

    clearSessionCookie(res, kind, cookieEnv());
    res.status(200).json(result);
  };
}
