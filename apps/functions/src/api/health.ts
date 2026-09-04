import type { Request, Response } from 'express';
import type { BackendEnvironment, HealthResponse } from '@veoullas-world/contracts';
import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { computeSchemaHealth } from '../services/schema-health.service.js';

const MILESTONE = 'M01';

export function resolveEnvironment(): BackendEnvironment {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'emulator';
  }
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return 'local';
}

export async function buildHealthResponse(gateway: SheetGateway | null): Promise<HealthResponse> {
  const { status } = loadGoogleServiceAccount();

  let sheetsReachable = false;
  let schemaHealth: HealthResponse['schemaHealth'] = {
    status: 'error',
    errorCount: 0,
    warningCount: 0,
  };
  let cache: HealthResponse['cache'] = { entryCount: 0, ttlSeconds: 60 };

  if (gateway) {
    try {
      await gateway.getMetadata();
      sheetsReachable = true;
    } catch {
      sheetsReachable = false;
    }

    if (sheetsReachable) {
      try {
        const health = await computeSchemaHealth(gateway);
        schemaHealth = {
          status: health.summary.status,
          errorCount: health.summary.errorCount,
          warningCount: health.summary.warningCount,
        };
      } catch {
        schemaHealth = { status: 'error', errorCount: 1, warningCount: 0 };
      }
    }

    cache = { entryCount: gateway.cacheEntryCount, ttlSeconds: gateway.ttlSeconds };
  }

  return {
    ok: true,
    service: 'veoullas-world-functions',
    environment: resolveEnvironment(),
    timestamp: new Date().toISOString(),
    milestone: MILESTONE,
    config: status,
    sheets: { reachable: sheetsReachable },
    schemaHealth,
    cache,
  };
}

export function createHealthHandler(getGateway: () => SheetGateway | null) {
  return async (_req: Request, res: Response): Promise<void> => {
    const response = await buildHealthResponse(getGateway());
    res.status(200).json(response);
  };
}
