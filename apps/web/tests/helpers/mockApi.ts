import { vi } from 'vitest';
import type {
  BootstrapResponse,
  ContentRuntimeResponse,
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

export const SAMPLE_CONTENT_RUNTIME_RESPONSE: ContentRuntimeResponse = {
  ok: true,
  languages: [
    {
      localeId: 'en',
      shortCode: 'EN',
      englishName: 'English',
      nativeName: 'English',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 1,
    },
    {
      localeId: 'ar-EG',
      shortCode: 'AR',
      englishName: 'Egyptian Arabic',
      nativeName: 'العربية المصرية',
      direction: 'rtl',
      fallbackLocale: 'en',
      sortOrder: 2,
    },
    {
      localeId: 'it',
      shortCode: 'IT',
      englishName: 'Italian',
      nativeName: 'Italiano',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 3,
    },
    {
      localeId: 'el',
      shortCode: 'EL',
      englishName: 'Greek',
      nativeName: 'Ελληνικά',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 4,
    },
    {
      localeId: 'fr',
      shortCode: 'FR',
      englishName: 'French',
      nativeName: 'Français',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 5,
    },
  ],
  uiText: [
    {
      uiTextRowId: 'uit_content_lab_title_en',
      textId: 'content_lab_title',
      screenId: 'content_lab',
      componentId: 'heading',
      locale: 'en',
      text: 'Content Runtime Lab',
      direction: 'ltr',
      ariaLabel: 'Content Runtime Lab heading',
    },
    {
      uiTextRowId: 'uit_content_lab_title_ar',
      textId: 'content_lab_title',
      screenId: 'content_lab',
      componentId: 'heading',
      locale: 'ar-EG',
      text: 'معمل تشغيل المحتوى',
      direction: 'rtl',
      ariaLabel: 'عنوان معمل تشغيل المحتوى',
    },
    {
      uiTextRowId: 'uit_content_lab_incomplete_ar',
      textId: 'content_lab_incomplete',
      screenId: 'content_lab',
      componentId: 'note',
      locale: 'ar-EG',
      text: 'ملاحظة بالعربية فقط',
      direction: 'rtl',
      ariaLabel: 'ملاحظة',
    },
  ],
  dialogue: [
    {
      dialogueRowId: 'dlg_boot_en',
      dialogueId: 'dlg_boot',
      groupId: 'grp_boot',
      sequence: 1,
      speakerId: 'char_var',
      locale: 'en',
      text: 'Hello, Veoulla.',
      direction: 'ltr',
      emotion: 'warm',
      displayMode: 'speech_bubble',
      voiceoverMediaRef: '/api/media/asset_vo_boot_en?v=1',
      requiresResponse: false,
    },
  ],
  voiceover: [
    {
      voiceoverId: 'vo_boot_en',
      contentType: 'dialogue',
      contentId: 'dlg_boot',
      locale: 'en',
      mediaRef: '/api/media/asset_vo_boot_en?v=1',
      captionText: 'Hello, Veoulla.',
      direction: 'ltr',
      durationMs: 2000,
      captionStartMs: 0,
      captionEndMs: 2000,
    },
  ],
  icons: [
    {
      iconId: 'icon_map',
      category: 'ui',
      displayName: 'Map',
      mediaRef: '/api/media/asset_icon_map?v=1',
      format: 'svg',
      rtlMirror: false,
      altTextId: 'ui_map',
    },
    {
      iconId: 'icon_back',
      category: 'ui',
      displayName: 'Back',
      mediaRef: '/api/media/asset_icon_back?v=1',
      format: 'svg',
      rtlMirror: true,
      altTextId: 'ui_back',
    },
  ],
  assets: [
    {
      assetId: 'asset_icon_map',
      assetType: 'image',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: false,
      mediaRef: '/api/media/asset_icon_map?v=1',
    },
  ],
  diagnostics: [
    {
      code: 'MISSING_ENGLISH_FALLBACK',
      tab: '08_UI_TEXT',
      subjectId: 'content_lab_incomplete',
      message: 'No enabled English ("en") row exists for "content_lab_incomplete" in 08_UI_TEXT.',
    },
  ],
  cacheGeneratedAt: '2026-01-01T00:00:00.000Z',
  requestId: 'test-content-runtime-request-id',
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
  /** Overrides the result of GET /api/content/runtime while the owner is logged in. Defaults to a sample success payload. */
  contentRuntimeResult?: unknown;
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
      if (url.startsWith('/api/content/runtime')) {
        if (!ownerLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.contentRuntimeResult ?? SAMPLE_CONTENT_RUNTIME_RESPONSE);
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
