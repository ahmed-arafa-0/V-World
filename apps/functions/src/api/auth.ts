import type { Request, Response } from 'express';
import type { AdminLoginResult, ApiError, GateLoginResult } from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import { setSessionCookie, type CookieEnv } from '../http/cookies.js';
import { resolveObservedIp } from '../http/ip-resolver.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { attemptAdminLogin, attemptGateLogin } from '../services/auth-orchestrator.service.js';
import {
  validateAdminLoginRequest,
  validateGateLoginRequest,
} from '../services/auth-request-validation.js';
import { buildSessionId } from '../services/session.service.js';

/** Maps a login result's non-ok code to the correct HTTP status: 401 for a wrong code/password, 429 while rate-limited. */
function loginFailureStatus(code: string): number {
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'invalid_request') return 400;
  return 401;
}

/**
 * POST /api/auth/gate — Veoulla's four-dial Gate entry. Never accepts a
 * complete expected Gate value from anywhere else in the system (Bootstrap
 * never exposes it); the only comparison happens here, backend-only,
 * against the live `02_USERS` row.
 */
export function createGateLoginHandler(
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response): Promise<void> => {
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

    const input = validateGateLoginRequest(req.body);
    if (!input) {
      const result: GateLoginResult = {
        ok: false,
        code: 'invalid_request',
        message: 'Invalid Gate login request.',
      };
      res.status(400).json(result);
      return;
    }

    try {
      const ip = resolveObservedIp(req);
      const result = await attemptGateLogin(gateway, { ...input, ip }, now());

      if (result.ok) {
        const expiresAt = new Date(Date.parse(result.session.expiresAt));
        setSessionCookie(
          res,
          'owner',
          buildSessionId('gate', input.attemptId),
          expiresAt,
          cookieEnv(),
        );
        res.status(200).json(result);
        return;
      }

      res.status(loginFailureStatus(result.code)).json(result);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}

/**
 * POST /api/auth/admin — separate Admin login. A generic failure covers
 * unknown user, inactive user, wrong role, and wrong password alike — the
 * response never reveals which one it was.
 */
export function createAdminLoginHandler(
  getGateway: () => SheetGateway | null,
  now: () => Date,
  cookieEnv: () => CookieEnv,
) {
  return async (req: Request, res: Response): Promise<void> => {
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

    const input = validateAdminLoginRequest(req.body);
    if (!input) {
      const result: AdminLoginResult = {
        ok: false,
        code: 'invalid_request',
        message: 'Invalid Admin login request.',
      };
      res.status(400).json(result);
      return;
    }

    try {
      const ip = resolveObservedIp(req);
      const result = await attemptAdminLogin(gateway, { ...input, ip }, now());

      if (result.ok) {
        const expiresAt = new Date(Date.parse(result.session.expiresAt));
        setSessionCookie(
          res,
          'admin',
          buildSessionId('admin', input.attemptId),
          expiresAt,
          cookieEnv(),
        );
        res.status(200).json(result);
        return;
      }

      res.status(loginFailureStatus(result.code)).json(result);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}
