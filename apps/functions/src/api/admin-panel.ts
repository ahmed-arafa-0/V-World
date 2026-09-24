import type { Request, Response } from 'express';
import type { AdminLogQuery, ApiError } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import {
  getAdminDashboard,
  inspectPlayer,
  queryAdminLogs,
} from '../services/admin-panel.service.js';

function sendError(res: Response, err: unknown): void {
  const { code, message, httpStatus } = toSafeApiError(err);
  const error: ApiError = { ok: false, code, message };
  res.status(httpStatus).json(error);
}

function backendUnavailable(res: Response): void {
  sendError(
    res,
    new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
  );
}

/** `GET /api/admin/dashboard` — protected by `requireAdmin` (see app.ts). Read-only. */
export function createAdminDashboardHandler(
  getGateway: () => SheetGateway | null,
  now: () => Date,
) {
  return async (_req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) return backendUnavailable(res);
    try {
      res.status(200).json(await getAdminDashboard(gateway, now()));
    } catch (err) {
      sendError(res, err);
    }
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function intParam(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : undefined;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** `GET /api/admin/logs` — protected by `requireAdmin`. Read-only; never mutates a log row. */
export function createAdminLogsHandler(getGateway: () => SheetGateway | null) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) return backendUnavailable(res);
    const query: AdminLogQuery = {
      from: stringParam(req.query.from),
      to: stringParam(req.query.to),
      eventType: stringParam(req.query.eventType),
      accessResult: stringParam(req.query.accessResult),
      ip: stringParam(req.query.ip),
      userId: stringParam(req.query.userId),
      limit: intParam(req.query.limit),
      offset: intParam(req.query.offset),
    };
    try {
      res.status(200).json(await queryAdminLogs(gateway, query));
    } catch (err) {
      sendError(res, err);
    }
  };
}

/**
 * `GET /api/admin/players/:userId` — protected by `requireAdmin`. Read-only inspector; every
 * field it returns is already readable by Ahmed directly in the Sheet, just aggregated here.
 */
export function createAdminPlayerInspectHandler(getGateway: () => SheetGateway | null) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) return backendUnavailable(res);
    const userId = stringParam(req.params.userId);
    if (!userId) {
      sendError(res, new AppError('invalid_request', 'A player user id is required.'));
      return;
    }
    try {
      res.status(200).json(await inspectPlayer(gateway, userId));
    } catch (err) {
      sendError(res, err);
    }
  };
}
