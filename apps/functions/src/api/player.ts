import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { localeOf } from './world.js';
import {
  getPlayerAchievements,
  getPlayerAchievementViews,
} from '../services/player-achievements.service.js';
import { getPlayerKeys } from '../services/player-keys.service.js';
import {
  checkpointProgress,
  completeRoute,
  getPlayerProgress,
} from '../services/player-progress.service.js';
import {
  validateCheckpointRequest,
  validateRouteCompleteRequest,
} from '../services/player-request-validation.js';

function sendError(res: Response, err: unknown): void {
  const { code, message, httpStatus } = toSafeApiError(err);
  const error: ApiError = { ok: false, code, message };
  res.status(httpStatus).json(error);
}

function requireOwnerUserId(res: Response): string {
  const userId = res.locals.ownerUserId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new AppError('backend_not_configured', 'No authenticated owner user was resolved.');
  }
  return userId;
}

/**
 * `GET /api/player/state` — owner-session-protected. Every field is scoped
 * to `res.locals.ownerUserId` (set by `createOwnerAuthMiddleware` from the
 * resolved session row, never from client input) — one player can never
 * read another's progress/keys/achievements through this endpoint.
 */
export function createPlayerStateHandler(getGateway: () => SheetGateway | null) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    try {
      const userId = requireOwnerUserId(res);
      const [progress, keys, achievements] = await Promise.all([
        getPlayerProgress(gateway, userId),
        getPlayerKeys(gateway, userId),
        getPlayerAchievements(gateway, userId),
      ]);
      res.status(200).json({ ok: true, progress, keys, achievements });
    } catch (err) {
      sendError(res, err);
    }
  };
}

/**
 * `GET /api/player/achievements` — owner-session-protected. The catalog/progress join
 * (`getPlayerAchievementViews`) already hides a still-locked secret achievement's title,
 * description, icon, and points, so nothing more is filtered here.
 */
export function createPlayerAchievementsHandler(getGateway: () => SheetGateway | null) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    try {
      const userId = requireOwnerUserId(res);
      const achievements = await getPlayerAchievementViews(gateway, userId, localeOf(req));
      res.status(200).json({ ok: true, achievements });
    } catch (err) {
      sendError(res, err);
    }
  };
}

export function createPlayerCheckpointHandler(
  getGateway: () => SheetGateway | null,
  now: () => Date,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    const input = validateCheckpointRequest(req.body);
    if (!input) {
      sendError(res, new AppError('invalid_request', 'Malformed checkpoint request.'));
      return;
    }
    try {
      const userId = requireOwnerUserId(res);
      const result = await checkpointProgress(gateway, { userId, ...input, now: now() });
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      sendError(res, err);
    }
  };
}

export function createPlayerRouteCompleteHandler(
  getGateway: () => SheetGateway | null,
  now: () => Date,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    const input = validateRouteCompleteRequest(req.body);
    if (!input) {
      sendError(res, new AppError('invalid_request', 'Malformed route-complete request.'));
      return;
    }
    try {
      const userId = requireOwnerUserId(res);
      const result = await completeRoute(gateway, userId, input.routeId, now());
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      sendError(res, err);
    }
  };
}
