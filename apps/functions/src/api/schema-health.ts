import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { computeSchemaHealth } from '../services/schema-health.service.js';

/**
 * GET /api/admin/schema-health — read-only, protected by the Admin
 * authorization middleware (see `api/admin-auth-middleware.ts`, wired in
 * `app.ts`). This handler itself must still never return Sheet row
 * contents, passwords, Gate codes, private keys, service keys, or Drive
 * file IDs — only sanitized structural diagnostics.
 */
export function createSchemaHealthHandler(getGateway: () => SheetGateway | null) {
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
      const response = await computeSchemaHealth(gateway, { bypass });
      res.status(200).json(response);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}
