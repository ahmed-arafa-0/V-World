import { vi } from 'vitest';
import type {
  AdminDashboardResponse,
  AdminLogsResponse,
  AdminPlayerInspectResponse,
  BootstrapResponse,
  ContentRuntimeResponse,
  HealthResponse,
  PreGateContentResponse,
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
    locationId: i === 1 ? 'beach' : `location_${i}`,
    displayNameTextId: `loc_${i}`,
    subtitleTextId: '',
    mapOrder: i,
    firstVisitOrder: i + 1,
    entrySceneId: `scene_${i}`,
    keyTypeId: i === 1 ? 'key_shell' : '',
    ambientAssetId: `ambient_${i}`,
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

export const SAMPLE_ADMIN_DASHBOARD_RESPONSE: AdminDashboardResponse = {
  ok: true,
  serverTime: '2026-01-01T00:00:00.000Z',
  timeZone: 'UTC',
  schemaHealth: SAMPLE_SCHEMA_HEALTH_RESPONSE.summary,
  activeSessionCount: 1,
  lastLogs: [
    {
      logId: 'log_fixture_1',
      timestamp: '2026-01-01T00:00:00.000Z',
      userId: 'veoulla',
      sessionId: 'sess_fixture_1',
      eventType: 'page_open',
      accessResult: 'ok',
      ip: '203.0.113.10',
      userAgent: 'fixture-agent',
      deviceId: 'device_fixture_1',
      language: 'en',
      route: '/',
    },
  ],
  cacheAgeMs: { '37_CHARACTER_STATE': 1200 },
};

export const SAMPLE_ADMIN_LOGS_RESPONSE: AdminLogsResponse = {
  ok: true,
  rows: SAMPLE_ADMIN_DASHBOARD_RESPONSE.lastLogs,
  total: 1,
};

export const SAMPLE_ADMIN_PLAYER_RESPONSE: AdminPlayerInspectResponse = {
  ok: true,
  userId: 'veoulla',
  character: {
    personalName: 'Veoulla',
    selectedGender: 'female',
    currentLocation: 'cottage',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  progress: [],
  keys: [],
  achievements: [],
  scores: [],
  messages: [],
  worldDocs: {},
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
    {
      uiTextRowId: 'uit_action_continue_en',
      textId: 'action_continue',
      screenId: 'global',
      componentId: 'continue_button',
      locale: 'en',
      text: 'Continue',
      direction: 'ltr',
      ariaLabel: 'Continue',
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
      requiresResponse: false,
    },
    {
      dialogueRowId: 'dlg_gate_01_en',
      dialogueId: 'dlg_gate_01',
      groupId: 'grp_gate',
      sequence: 1,
      speakerId: 'var',
      locale: 'en',
      text: '(fixture) Gate opening line.',
      direction: 'ltr',
      emotion: 'warm',
      displayMode: 'speech_bubble',
      requiresResponse: false,
    },
    {
      dialogueRowId: 'dlg_name_01_en',
      dialogueId: 'dlg_name_01',
      groupId: 'grp_name',
      sequence: 1,
      speakerId: 'var',
      locale: 'en',
      text: '(fixture) Naming prompt line.',
      direction: 'ltr',
      emotion: 'warm',
      displayMode: 'speech_bubble',
      requiresResponse: false,
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
    {
      assetId: 'map_island_transparent',
      assetType: 'image',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: false,
      mediaRef: '/api/media/map_island_transparent?v=1',
    },
    {
      assetId: 'map_ocean_loop',
      assetType: 'video',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: true,
      mediaRef: '/api/media/map_ocean_loop?v=1',
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

export const SAMPLE_PRE_GATE_CONTENT_RESPONSE: PreGateContentResponse = {
  ok: true,
  appName: "Veoulla's World",
  languages: SAMPLE_CONTENT_RUNTIME_RESPONSE.languages,
  dialogue: SAMPLE_CONTENT_RUNTIME_RESPONSE.dialogue.filter((d) => d.dialogueId === 'dlg_gate_01'),
  uiText: SAMPLE_CONTENT_RUNTIME_RESPONSE.uiText.filter((u) => u.textId === 'action_continue'),
  // Empty by default — matches the real backend when neither allowlisted
  // asset (gate_closed_bg, var_idle_no_collar) is registered/enabled yet.
  // Tests that need one present override via `preGateContentResult`.
  assets: [],
  icons: [],
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

/** A journey standing at the Church (Phase 1 finished): the state every FirstOpeningFlow test resumes into. */
export const SAMPLE_WORLD_JOURNEY = {
  ok: true,
  routeId: 'first_journey',
  storyVersion: 'first_journey_v1',
  phase: 'original',
  completed: false,
  mapUnlocked: false,
  forced: false,
  currentBeat: {
    beatId: 'beat_07_church',
    sequence: 7,
    locationId: 'church',
    sceneId: 'scene_church_approach',
    beatType: 'location_intro',
    titleTextId: '',
    dialogueGroupId: 'dlg_beat_07_church',
    requiredInteractionId: 'church_first_interaction',
    rewardRuleId: 'rule_first_candle',
    walkmanState: 'locked',
    done: false,
  },
  beats: [],
  startLocation: 'church',
  accessibleLocations: ['beach', 'church'],
  keys: [],
  walkmanUnlocked: false,
  museumRequirement: [],
};

export const SAMPLE_WORLD_MAP = {
  ok: true,
  unlocked: false,
  currentLocation: 'church',
  locations: ['beach', 'church', 'cafe'].map((locationId, i) => ({
    locationId,
    mapOrder: i + 1,
    roadSide: '',
    elevationBand: '',
    keyTypeId: '',
    locked: i > 1,
    visited: false,
  })),
};

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
  /**
   * Overrides the result of GET /api/dev/map-preview-assets. Defaults to
   * the real backend's own `staging`/`production` shape — a generic 404,
   * `{ ok: false, code: 'not_found', message: 'No route for GET /api/dev/map-preview-assets' }`
   * — so a test must explicitly opt into "this looks like a local/emulator
   * backend" rather than that being the default, matching the server-side
   * default-deny posture.
   */
  devMapPreviewResult?: unknown;
  /** Overrides GET /api/world/journey. Defaults to a journey standing at the Church. */
  worldJourneyResult?: unknown;
  /** Overrides GET /api/world/map. */
  worldMapResult?: unknown;
  /** Overrides the result of GET /api/player/state while the owner is logged in. Defaults to an empty-progress payload. */
  playerStateResult?: unknown;
  /** Overrides the result of GET /api/player/achievements while the owner is logged in. Defaults to an empty list. */
  playerAchievementsResult?: unknown;
  /** Overrides the result of POST /api/player/checkpoint. Defaults to a generic applied success. */
  playerCheckpointResult?: unknown;
  /** Overrides POST /api/player/keys/award. */
  playerKeyAwardResult?: unknown;
  /** Overrides the result of GET /api/content/pre-gate (public, no session required). Defaults to a fixture-shaped success with the gate-opening dialogue. */
  preGateContentResult?: unknown;
  /** Overrides the result of GET /api/character/state. Defaults to `{ ok: true, character: null }` (not yet named). */
  characterStateResult?: unknown;
  /** Overrides GET /api/admin/dashboard while the Admin is logged in. */
  adminDashboardResult?: unknown;
  /** Overrides GET /api/admin/logs while the Admin is logged in. */
  adminLogsResult?: unknown;
  /** Overrides GET /api/admin/players/:userId while the Admin is logged in. */
  adminPlayerResult?: unknown;
  /** Overrides the result of POST /api/character/name. Defaults to a generic success echoing the submitted name/gender. */
  characterNameResult?: unknown;
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
      if (url.startsWith('/api/content/pre-gate')) {
        // Deliberately public — never gated by ownerLoggedIn, matching the
        // real backend (see apps/functions/src/api/pre-gate-content.ts).
        return jsonResponse(options.preGateContentResult ?? SAMPLE_PRE_GATE_CONTENT_RESPONSE);
      }
      if (url.startsWith('/api/admin/schema-health')) {
        if (!adminLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(SAMPLE_SCHEMA_HEALTH_RESPONSE);
      }
      if (url.startsWith('/api/admin/dashboard')) {
        if (!adminLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.adminDashboardResult ?? SAMPLE_ADMIN_DASHBOARD_RESPONSE);
      }
      if (url.startsWith('/api/admin/logs')) {
        if (!adminLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.adminLogsResult ?? SAMPLE_ADMIN_LOGS_RESPONSE);
      }
      if (url.startsWith('/api/admin/players/')) {
        if (!adminLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.adminPlayerResult ?? SAMPLE_ADMIN_PLAYER_RESPONSE);
      }
      if (url.startsWith('/api/content/runtime')) {
        if (!ownerLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.contentRuntimeResult ?? SAMPLE_CONTENT_RUNTIME_RESPONSE);
      }
      if (url.startsWith('/api/world/')) {
        if (!ownerLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        if (url.startsWith('/api/world/journey') && method === 'GET') {
          return jsonResponse(options.worldJourneyResult ?? SAMPLE_WORLD_JOURNEY);
        }
        if (url.startsWith('/api/world/map') && method === 'GET') {
          return jsonResponse(options.worldMapResult ?? SAMPLE_WORLD_MAP);
        }
        return jsonResponse({ ok: true });
      }
      if (url.startsWith('/api/dev/map-preview-assets')) {
        const body = options.devMapPreviewResult ?? {
          ok: false,
          code: 'not_found',
          message: 'No route for GET /api/dev/map-preview-assets',
        };
        // Mirrors the real backend: the HTTP-level "ok" flag tracks the
        // body's own `ok` field (a 404/error body is a non-2xx response),
        // not merely whether a test supplied an override.
        const httpOk = (body as { ok?: boolean }).ok !== false;
        return jsonResponse(body, httpOk);
      }
      if (url.startsWith('/api/player/state')) {
        if (!ownerLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(
          options.playerStateResult ?? { ok: true, progress: [], keys: [], achievements: [] },
        );
      }
      if (url.startsWith('/api/player/achievements')) {
        if (!ownerLoggedIn) {
          return jsonResponse({ ok: false, code: 'SESSION_REQUIRED', message: 'nope' }, false);
        }
        return jsonResponse(options.playerAchievementsResult ?? { ok: true, achievements: [] });
      }
      if (url.startsWith('/api/player/checkpoint') && method === 'POST') {
        return jsonResponse(
          options.playerCheckpointResult ?? { ok: true, applied: true, reason: 'created' },
        );
      }
      if (url.startsWith('/api/player/keys/award') && method === 'POST') {
        return jsonResponse(
          options.playerKeyAwardResult ?? {
            ok: true,
            applied: true,
            reason: 'created',
            key: {
              userId: 'fixture_owner',
              keyTypeId: 'key_shell',
              quantityFound: 1,
              quantitySpent: 0,
              quantityAvailable: 1,
              lastFoundAt: '2026-01-01T00:00:00.000Z',
              lastAwardDate: '2026-01-01',
            },
          },
        );
      }
      if (url.startsWith('/api/character/state') && method === 'GET') {
        return jsonResponse(options.characterStateResult ?? { ok: true, character: null });
      }
      if (url.startsWith('/api/character/name') && method === 'POST') {
        if (options.characterNameResult) {
          const httpOk = (options.characterNameResult as { ok?: boolean }).ok !== false;
          return jsonResponse(options.characterNameResult, httpOk);
        }
        const submitted: { personalName?: string; selectedGender?: string } = init?.body
          ? (JSON.parse(init.body as string) as { personalName?: string; selectedGender?: string })
          : {};
        return jsonResponse({
          ok: true,
          character: {
            userId: 'fixture_owner',
            characterId: 'var',
            personalName: submitted.personalName ?? '',
            selectedGender: submitted.selectedGender ?? '',
            relationshipLevel: 'new',
            currentLocation: '',
            mood: '',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        });
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
