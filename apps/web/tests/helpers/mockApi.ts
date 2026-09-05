import { vi } from 'vitest';
import type {
  BootstrapResponse,
  HealthResponse,
  SafeSessionSummary,
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
  note: 'This endpoint returns only sanitized structural diagnostics and requires an authenticated Admin session.',
};

export const SAMPLE_OWNER_SESSION: SafeSessionSummary = {
  kind: 'owner',
  userId: 'veoulla',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-02T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};

export const SAMPLE_ADMIN_SESSION: SafeSessionSummary = {
  kind: 'admin',
  userId: 'admin_ahmed',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-01T02:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, httpOk = true) {
  return { ok: httpOk, json: async () => body };
}

export interface MockFetchOptions {
  /** Whether GET /api/session/owner should report an already-active session. Defaults to unauthenticated. */
  ownerSession?: 'authenticated' | 'unauthenticated';
  /** Whether GET /api/session/admin should report an already-active session. Defaults to unauthenticated. */
  adminSession?: 'authenticated' | 'unauthenticated';
  /** Overrides the result of the next POST /api/auth/gate call. Defaults to success. */
  gateLoginResult?: unknown;
  /** Overrides the result of the next POST /api/auth/admin call. Defaults to success. */
  adminLoginResult?: unknown;
}

/**
 * Routes a mocked global.fetch by method + URL to the matching canned
 * response. Tracks a small in-memory "is this kind currently logged in"
 * flag per session kind so a fresh login/logout inside one test flows
 * naturally into subsequent resume/heartbeat/schema-health calls, the same
 * way the real HttpOnly cookie would.
 */
export function installMockFetch(options: MockFetchOptions = {}): void {
  let ownerLoggedIn = options.ownerSession === 'authenticated';
  let adminLoggedIn = options.adminSession === 'authenticated';

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.startsWith('/api/health')) return jsonResponse(HEALTHY_HEALTH_RESPONSE);
      if (url.startsWith('/api/bootstrap')) return jsonResponse(SAMPLE_BOOTSTRAP_RESPONSE);
      if (url.startsWith('/api/admin/schema-health')) {
        if (!adminLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(SAMPLE_SCHEMA_HEALTH_RESPONSE);
      }

      if (url.startsWith('/api/access/page-open') && method === 'POST') {
        return jsonResponse({ ok: true, logId: 'log_test_pageopen' });
      }

      if (url.startsWith('/api/session/owner/heartbeat') && method === 'POST') {
        return jsonResponse({ ok: true, session: SAMPLE_OWNER_SESSION });
      }
      if (url.startsWith('/api/session/admin/heartbeat') && method === 'POST') {
        return jsonResponse({ ok: true, session: SAMPLE_ADMIN_SESSION });
      }

      if (url.startsWith('/api/session/owner') && method === 'GET') {
        return ownerLoggedIn
          ? jsonResponse({ ok: true, session: SAMPLE_OWNER_SESSION })
          : jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' });
      }
      if (url.startsWith('/api/session/admin') && method === 'GET') {
        return adminLoggedIn
          ? jsonResponse({ ok: true, session: SAMPLE_ADMIN_SESSION })
          : jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' });
      }

      if (url.startsWith('/api/session/owner') && method === 'DELETE') {
        ownerLoggedIn = false;
        return jsonResponse({ ok: true });
      }
      if (url.startsWith('/api/session/admin') && method === 'DELETE') {
        adminLoggedIn = false;
        return jsonResponse({ ok: true });
      }

      if (url === '/api/auth/gate' && method === 'POST') {
        const result = options.gateLoginResult ?? { ok: true, session: SAMPLE_OWNER_SESSION };
        if ((result as { ok?: boolean }).ok) ownerLoggedIn = true;
        return jsonResponse(result);
      }
      if (url === '/api/auth/admin' && method === 'POST') {
        const result = options.adminLoginResult ?? { ok: true, session: SAMPLE_ADMIN_SESSION };
        if ((result as { ok?: boolean }).ok) adminLoggedIn = true;
        return jsonResponse(result);
      }

      throw new Error(`Unmocked fetch URL in test: ${method} ${url}`);
    }),
  );
}
