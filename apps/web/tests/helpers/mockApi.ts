import { vi } from 'vitest';
import type {
  BootstrapResponse,
  HealthResponse,
  SchemaHealthResponse,
} from '@veoullas-world/contracts';

export const HEALTHY_HEALTH_RESPONSE: HealthResponse = {
  ok: true,
  service: 'veoullas-world-functions',
  environment: 'local',
  timestamp: '2026-01-01T00:00:00.000Z',
  milestone: 'M01',
  config: { googleServiceAccount: { present: true, reason: 'configured' } },
  sheets: { reachable: true },
  schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
  cache: { entryCount: 3, ttlSeconds: 60 },
};

export const SAMPLE_BOOTSTRAP_RESPONSE: BootstrapResponse = {
  ok: true,
  config: {
    appName: "Veoulla's World",
    defaultLanguage: 'en',
    normalStartLocation: 'cottage',
    authoritativeTimeZone: 'Africa/Cairo',
  },
  languages: Array.from({ length: 5 }, (_, i) => ({
    localeId: `locale_${i}`,
    shortCode: `L${i}`,
    englishName: `Language ${i}`,
    nativeName: `Language ${i}`,
    direction: 'ltr' as const,
    sortOrder: i,
  })),
  locations: Array.from({ length: 8 }, (_, i) => ({
    locationId: `location_${i}`,
    displayNameTextId: `loc_${i}`,
    subtitleTextId: '',
    mapOrder: i,
  })),
  storyBeats: Array.from({ length: 18 }, (_, i) => ({
    beatId: `beat_${i}`,
    sequence: i,
    locationId: 'gate',
    beatType: 'story',
  })),
  icons: [{ iconId: 'icon_map', category: 'ui', displayName: 'Map', format: 'svg' }],
  assets: [],
  currentEvent: { eventId: 'birthday_2026', eventName: 'Birthday', eventType: 'birthday' },
  sheetVersion: '0.2',
  cacheGeneratedAt: '2026-01-01T00:00:00.000Z',
  schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
  requestId: 'test-request-id',
};

export const SAMPLE_SCHEMA_HEALTH_RESPONSE: SchemaHealthResponse = {
  ok: true,
  summary: {
    status: 'warning',
    expectedTabCount: 42,
    foundTabCount: 42,
    healthyTabCount: 40,
    errorCount: 0,
    warningCount: 2,
    infoCount: 0,
    checkedAt: '2026-01-01T00:00:00.000Z',
  },
  tabs: [
    {
      tab: '01_APP_CONFIG',
      found: true,
      status: 'healthy',
      requiredColumnCount: 6,
      actualColumnCount: 6,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    },
    {
      tab: '10_ASSETS',
      found: true,
      status: 'warning',
      requiredColumnCount: 12,
      actualColumnCount: 12,
      errorCount: 0,
      warningCount: 2,
      infoCount: 0,
    },
  ],
  diagnostics: [
    {
      tab: '10_ASSETS',
      code: 'PLACEHOLDER_VALUE',
      severity: 'WARNING',
      column: 'drive_file_id',
      message: 'Column "drive_file_id" still contains an un-replaced placeholder value.',
    },
  ],
  note: 'This endpoint is temporary and must be protected by Admin authentication starting M02.',
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

/** Routes a mocked global.fetch by URL to the matching canned response. */
export function installMockFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/health')) return jsonResponse(HEALTHY_HEALTH_RESPONSE);
      if (url.startsWith('/api/bootstrap')) return jsonResponse(SAMPLE_BOOTSTRAP_RESPONSE);
      if (url.startsWith('/api/admin/schema-health'))
        return jsonResponse(SAMPLE_SCHEMA_HEALTH_RESPONSE);
      throw new Error(`Unmocked fetch URL in test: ${url}`);
    }),
  );
}
