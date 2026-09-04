import type { Request, Response } from 'express';
import type { BackendEnvironment, HealthResponse } from '@veoullas-world/contracts';
import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';

const MILESTONE = 'M00';

export function resolveEnvironment(): BackendEnvironment {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'emulator';
  }
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return 'local';
}

export function buildHealthResponse(): HealthResponse {
  const { status } = loadGoogleServiceAccount();

  return {
    ok: true,
    service: 'veoullas-world-functions',
    environment: resolveEnvironment(),
    timestamp: new Date().toISOString(),
    milestone: MILESTONE,
    config: status,
  };
}

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json(buildHealthResponse());
}
