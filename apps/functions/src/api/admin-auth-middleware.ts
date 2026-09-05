import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { httpStatusForCode } from '../errors/app-error.js';
import { clearSessionCookie, readSessionCookie, type CookieEnv } from '../http/cookies.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { resolveActiveSession } from '../services/session-resolution.service.js';

const GENERIC_MESSAGES: Record<string, string> = {
  SESSION_REQUIRED: 'Admin authentication is required.',
  SESSION_INVALID: 'Admin session is invalid.',
  SESSION_EXPIRED: 'Admin session has expired.',
  SESSION_TERMINATED: 'Admin session has been terminated.',
  SESSION_FORBIDDEN: 'Not authorized for this resource.',
};

/**
 * Reusable Admin-only authorization middleware. Validates the Admin cookie
 * against the live (uncached) Sheet session state and the required role —
 * an owner (Gate) session, presented in the Admin cookie, is rejected as
 * `SESSION_FORBIDDEN` (403), not merely unauthenticated. Never exposes the
 * session row or Admin user data; on any failure the Admin cookie is
 * cleared and a safe 401/403 error is returned instead of calling `next()`.
 */
export function createAdminAuthMiddleware(
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

    const sessionId = readSessionCookie(req, 'admin');
    const resolution = await resolveActiveSession(gateway, 'admin', sessionId, now());

    if (!resolution.ok) {
      clearSessionCookie(res, 'admin', cookieEnv());
      const error: ApiError = {
        ok: false,
        code: resolution.code,
        message: GENERIC_MESSAGES[resolution.code] ?? 'Not authorized.',
      };
      res.status(httpStatusForCode(resolution.code)).json(error);
      return;
    }

    next();
  };
}
