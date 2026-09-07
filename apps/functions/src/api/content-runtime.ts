import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { computeContentRuntime } from '../services/content-runtime.service.js';

/**
 * GET /api/content/runtime — owner-session-protected (see
 * `createOwnerAuthMiddleware`), sanitized localization/UI-text/dialogue/
 * voice-over/icon/asset-status payload for the M03 Content Runtime Lab.
 * `?refresh=1` bypasses the read cache; stays read-only.
 */
export function createContentRuntimeHandler(getGateway: () => SheetGateway | null) {
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
      const response = await computeContentRuntime(gateway, { bypass });
      res.status(200).json(response);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}
