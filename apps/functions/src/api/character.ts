import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import {
  getCharacterState,
  requireValidCharacterId,
  setCharacterNameAndGender,
  validatePersonalName,
  validateSelectedGender,
} from '../services/character-state.service.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

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

/** `GET /api/character/state?characterId=var` — owner-session-protected. */
export function createCharacterStateHandler(getGateway: () => SheetGateway | null) {
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
      const characterId = requireValidCharacterId(req.query.characterId);
      const userId = requireOwnerUserId(res);
      const character = await getCharacterState(gateway, userId, characterId);
      res.status(200).json({ ok: true, character });
    } catch (err) {
      sendError(res, err);
    }
  };
}

/** `POST /api/character/name` `{characterId, personalName, selectedGender}` — owner-session-protected. Available at any time, not just the first-visit naming beat (Living Bible §18H: renaming is always allowed). */
export function createCharacterNameHandler(getGateway: () => SheetGateway | null, now: () => Date) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    const body = req.body as Record<string, unknown> | null;
    const allowedKeys = ['characterId', 'personalName', 'selectedGender'];
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Object.keys(body).every((k) => allowedKeys.includes(k))
    ) {
      sendError(res, new AppError('invalid_request', 'Malformed character-name request.'));
      return;
    }
    const personalName = validatePersonalName(body.personalName);
    const selectedGender = validateSelectedGender(body.selectedGender);
    if (!personalName || !selectedGender) {
      sendError(res, new AppError('invalid_request', 'Malformed character-name request.'));
      return;
    }
    try {
      const characterId = requireValidCharacterId(body.characterId);
      const userId = requireOwnerUserId(res);
      const character = await setCharacterNameAndGender(gateway, {
        userId,
        characterId,
        personalName,
        selectedGender,
        now: now(),
      });
      res.status(200).json({ ok: true, character });
    } catch (err) {
      sendError(res, err);
    }
  };
}
