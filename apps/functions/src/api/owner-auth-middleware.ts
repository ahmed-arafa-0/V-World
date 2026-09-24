import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { httpStatusForCode, toSafeApiError } from '../errors/app-error.js';
import { clearSessionCookie, readSessionCookie, type CookieEnv } from '../http/cookies.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { resolveActiveSession } from '../services/session-resolution.service.js';

const GENERIC_MESSAGES: Record<string, string> = {
  SESSION_REQUIRED: 'Owner authentication is required.',
  SESSION_INVALID: 'Owner session is invalid.',
  SESSION_EXPIRED: 'Owner session has expired.',
  SESSION_TERMINATED: 'Owner session has been terminated.',
  SESSION_FORBIDDEN: 'Not authorized for this resource.',
};

/**
 * Reusable owner-only authorization middleware, mirroring
 * `createAdminAuthMiddleware` exactly but for the owner (Gate) session kind.
 * An Admin session presented in the owner cookie is rejected as
 * `SESSION_FORBIDDEN` (403), not merely unauthenticated — Admin
 * authentication must never count as owner authentication. On any failure
 * the owner cookie is cleared and a safe 401/403 error is returned instead
 * of calling `next()`.
 */
export function createOwnerAuthMiddleware(
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      const error: ApiError = {
        ok: false,
        code: 'backend_not_configured',
        message: 'Google Sheets backend is not configured.',
      };
      res.status(503).json(error);
      return;
    }

    const sessionId = readSessionCookie(req, 'owner');
    let resolution: Awaited<ReturnType<typeof resolveActiveSession>>;
    try {
      resolution = await resolveActiveSession(gateway, 'owner', sessionId, now());
    } catch (error) {
      const safe = toSafeApiError(error);
      const body: ApiError = { ok: false, code: safe.code, message: safe.message };
      res.status(safe.httpStatus).json(body);
      return;
    }

    if (!resolution.ok) {
      clearSessionCookie(res, 'owner', cookieEnv());
      const error: ApiError = {
        ok: false,
        code: resolution.code,
        message: GENERIC_MESSAGES[resolution.code] ?? 'Not authorized.',
      };
      res.status(httpStatusForCode(resolution.code)).json(error);
      return;
    }

    // Downstream player-state handlers need to know WHICH user this is —
    // always from the resolved session row, never from a client-supplied
    // body/query field, so one player can never read or mutate another's
    // state. `res.locals` is the idiomatic Express place for this.
    res.locals.ownerUserId = resolution.row.user_id ?? '';

    next();
  };
}
