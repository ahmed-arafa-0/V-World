import { describe, expect, it } from 'vitest';
import type { ApiError, BackendConfigStatus, HealthResponse } from '@veoullas-world/contracts';

describe('shared contracts compile and are usable from the frontend', () => {
  it('builds a valid HealthResponse using the shared type', () => {
    const config: BackendConfigStatus = {
      googleServiceAccount: { present: false, reason: 'not_configured' },
    };
    const health: HealthResponse = {
      ok: true,
      service: 'veoullas-world-functions',
      environment: 'local',
      timestamp: new Date().toISOString(),
      milestone: 'M00',
      config,
    };

    expect(health.service).toBe('veoullas-world-functions');
    expect(health.config.googleServiceAccount.present).toBe(false);
  });

  it('builds a valid ApiError using the shared type', () => {
    const error: ApiError = { ok: false, code: 'not_found', message: 'nope' };
    expect(error.ok).toBe(false);
  });
});
