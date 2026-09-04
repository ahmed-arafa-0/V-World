import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { buildBootstrapResponse } from '../services/bootstrap.service.js';

/**
 * GET /api/bootstrap — public, sanitized, allowlisted app configuration.
 * `?refresh=1` bypasses the read cache; it stays read-only and never exposes
 * Admin or secret data. M02 may protect or replace this refresh path.
 */
export function createBootstrapHandler(getGateway: () => SheetGateway | null) {
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

    const bypass = req.query.refresh === '1';

    try {
      const response = await buildBootstrapResponse(gateway, { bypass });
      res.status(200).json(response);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}
