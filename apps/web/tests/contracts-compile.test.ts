import { describe, expect, it } from 'vitest';
import type {
  ApiError,
  BackendConfigStatus,
  BootstrapResponse,
  HealthResponse,
  SchemaHealthResponse,
} from '@veoullas-world/contracts';

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
      milestone: 'M01',
      config,
      sheets: { reachable: true },
      schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
      cache: { entryCount: 0, ttlSeconds: 60 },
    };

    expect(health.service).toBe('veoullas-world-functions');
    expect(health.config.googleServiceAccount.present).toBe(false);
    expect(health.sheets.reachable).toBe(true);
  });

  it('builds a valid ApiError using the shared type', () => {
    const error: ApiError = { ok: false, code: 'not_found', message: 'nope' };
    expect(error.ok).toBe(false);
  });

  it('builds a valid BootstrapResponse using the shared type', () => {
    const bootstrap: BootstrapResponse = {
      ok: true,
      config: {
        appName: "Veoulla's World",
        defaultLanguage: 'en',
        normalStartLocation: 'cottage',
        authoritativeTimeZone: 'Africa/Cairo',
      },
      languages: [],
      locations: [],
      storyBeats: [],
      icons: [],
      assets: [],
      currentEvent: null,
      sheetVersion: '0.2',
      cacheGeneratedAt: new Date().toISOString(),
      schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
      requestId: 'test-request-id',
    };

    expect(bootstrap.config.appName).toBe("Veoulla's World");
  });

  it('builds a valid SchemaHealthResponse using the shared type', () => {
    const schemaHealth: SchemaHealthResponse = {
      ok: true,
      summary: {
        status: 'healthy',
        expectedTabCount: 42,
        foundTabCount: 42,
        healthyTabCount: 42,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        checkedAt: new Date().toISOString(),
      },
      tabs: [],
      diagnostics: [],
      note: 'M02 protection required',
    };

    expect(schemaHealth.summary.expectedTabCount).toBe(42);
  });
});
