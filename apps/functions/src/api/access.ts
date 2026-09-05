import type { Request, Response } from 'express';
import type { ApiError, PageOpenResult } from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import { resolveObservedIp } from '../http/ip-resolver.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { validatePageOpenRequest } from '../services/auth-request-validation.js';
import { appendEntryLogIfAbsent } from '../services/entry-log.service.js';

/**
 * POST /api/access/page-open — logs one `page_open` entry, idempotently
 * keyed by the client-supplied `operationId` (a retry with the same ID
 * returns the original log ID rather than creating a duplicate). Only ever
 * reads safe metadata from the body; the server-observed IP is resolved
 * independently and any client-supplied `ip`/`ip_address` field is ignored
 * outright (never even looked at).
 */
export function createPageOpenHandler(getGateway: () => SheetGateway | null, now: () => Date) {
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

    const input = validatePageOpenRequest(req.body);
    if (!input) {
      const result: PageOpenResult = {
        ok: false,
        code: 'invalid_request',
        message: 'Invalid page-open request.',
      };
      res.status(400).json(result);
      return;
    }

    try {
      const ip = resolveObservedIp(req);
      const { logId } = await appendEntryLogIfAbsent(gateway, `log_pageopen_${input.operationId}`, {
        eventType: 'page_open',
        accessResult: 'logged',
        timestamp: now().toISOString(),
        ip,
        deviceId: input.deviceId,
        language: input.language,
        route: input.route,
      });

      const result: PageOpenResult = { ok: true, logId };
      res.status(200).json(result);
    } catch (err) {
      const { message } = toSafeApiError(err);
      const result: PageOpenResult = { ok: false, code: 'ACCESS_SERVICE_UNAVAILABLE', message };
      res.status(503).json(result);
    }
  };
}
