import cors from 'cors';
import express, { type Express } from 'express';
import path from 'node:path';
import type { ApiError, BackendEnvironment } from '@veoullas-world/contracts';
import { createAdminAuthMiddleware } from './api/admin-auth-middleware.js';
import { createOwnerAuthMiddleware } from './api/owner-auth-middleware.js';
import { createPageOpenHandler } from './api/access.js';
import { createAdminLoginHandler, createGateLoginHandler } from './api/auth.js';
import { createBootstrapHandler } from './api/bootstrap.js';
import { createCharacterNameHandler, createCharacterStateHandler } from './api/character.js';
import { createContentRuntimeHandler } from './api/content-runtime.js';
import { createDevelopmentOnlyMiddleware } from './api/development-only-middleware.js';
import {
  createDevBirthdayTestClockGetHandler,
  createDevBirthdayTestClockSetHandler,
} from './api/dev-birthday-test-clock.js';
import { createDevMapPreviewHandler } from './api/dev-map-preview.js';
import { createBirthdayTestClock } from './dev/birthday-test-clock.js';
import { createHealthHandler, resolveEnvironment } from './api/health.js';
import { createMediaHandler } from './api/media.js';
import { createPreGateContentHandler } from './api/pre-gate-content.js';
import { createPublicMediaHandler } from './api/public-media.js';
import {
  createPlayerAchievementsHandler,
  createPlayerCheckpointHandler,
  createPlayerRouteCompleteHandler,
  createPlayerStateHandler,
} from './api/player.js';
import { createWorldRouter } from './api/world.js';
import { openMeteoProvider, type WeatherProvider } from './world/weather.js';
import { createSchemaHealthHandler } from './api/schema-health.js';
import {
  createAdminDashboardHandler,
  createAdminLogsHandler,
  createAdminPlayerInspectHandler,
} from './api/admin-panel.js';
import {
  createSessionHeartbeatHandler,
  createSessionLogoutHandler,
  createSessionResumeHandler,
} from './api/session.js';
import type { CookieEnv } from './http/cookies.js';
import type { GoogleDriveClient } from './google/drive-types.js';
import { getProductionDriveClientOrNull } from './repositories/drive-context.js';
import { getProductionGatewayOrNull } from './repositories/gateway-context.js';
import { KeyMutex } from './repositories/key-mutex.js';
import type { SheetGateway } from './repositories/sheet-gateway.js';

export interface CreateAppOptions {
  /** Explicit opt-in used only by the dedicated loopback birthday review launcher. */
  birthdayReviewUserId?: string;
  /** Defaults to the real, credential-backed production gateway (or null when unconfigured). */
  getGateway?: () => SheetGateway | null;
  /** Defaults to the real, credential-backed production Drive client (or null when unconfigured). */
  getDriveClient?: () => GoogleDriveClient | null;
  /** Backend clock seam — defaults to the real wall clock. Tests inject a fake to hit exact expiry/cooldown boundaries deterministically. */
  now?: () => Date;
  /** Cookie `Secure` attribute seam — defaults to true only in the real `production` environment (compatible with plain HTTP on localhost/emulators). */
  isProduction?: () => boolean;
  /** Backend-environment seam for the dev-only routes below — defaults to the real `resolveEnvironment()`. Tests inject a fake to exercise both branches without mutating `process.env`. */
  getEnvironment?: () => BackendEnvironment;
  /** Serializes concurrent player-key read-decide-write sequences for the same (userId, keyTypeId) — defaults to a fresh mutex per app instance. Tests can inject their own to assert on serialization directly. */
  playerKeyMutex?: KeyMutex;
  /** Real-rain source for the Farm — defaults to Open-Meteo; tests inject a stub. */
  weatherProvider?: WeatherProvider;
  /**
   * Absolute path to the built frontend (`apps/web/dist`). Only set on a
   * free-hosting deployment that serves the SPA and the API from one Node
   * process (no Firebase Hosting rewrite available) — see
   * `local-server.ts`/`production-server.ts`. Left unset, `createApp()`'s
   * behavior is byte-for-byte what it always was: the Firebase Functions
   * export (`index.ts`) and every existing test never pass this, so neither
   * is affected by its existence.
   */
  staticRoot?: string;
}

export function createApp(options?: CreateAppOptions): Express {
  const getGateway = options?.getGateway ?? getProductionGatewayOrNull;
  const getDriveClient = options?.getDriveClient ?? getProductionDriveClientOrNull;
  const now = options?.now ?? (() => new Date());
  const isProduction = options?.isProduction ?? (() => resolveEnvironment() === 'production');
  const cookieEnv = (): CookieEnv => ({ isProduction: isProduction() });
  const getEnvironment = options?.getEnvironment ?? resolveEnvironment;
  // "Development" is deliberately narrow — only the real local dev server or
  // the Firebase emulator. `staging` is NOT treated as development: a
  // developer-only preview must not leak onto any shared/deployed
  // environment a player or reviewer could reach.
  const isDevelopmentEnvironment = () => {
    const env = getEnvironment();
    return env === 'local' || env === 'emulator';
  };
  const playerKeyMutex = options?.playerKeyMutex ?? new KeyMutex();
  const birthdayClock = createBirthdayTestClock(options?.birthdayReviewUserId);
  const birthdayReviewEnabled = () =>
    birthdayClock.configured && isDevelopmentEnvironment() && !isProduction();

  const app = express();

  // Firebase Hosting/Cloud Functions sits behind exactly one trusted
  // Google-managed proxy hop. `trust proxy: 1` (not `true`) trusts only
  // that single hop, so `req.ip` resolves to the address just inside it —
  // NOT the leftmost X-Forwarded-For entry, which a client could prepend
  // arbitrary spoofed hops onto if the whole chain were trusted. A
  // local/emulator connection has no such header and falls back to the
  // direct socket address. Client-supplied "ip"/"ip_address" body/query
  // fields are never read anywhere in this app — this is the only source
  // of truth for the observed request IP.
  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', createHealthHandler(getGateway));
  app.get('/api/bootstrap', createBootstrapHandler(getGateway));
  // Deliberately public — see pre-gate-content.ts for why this cannot be
  // owner-session-gated like /api/content/runtime.
  app.get('/api/content/pre-gate', createPreGateContentHandler(getGateway));

  // Deliberately public, but only for the small explicit allowlist in
  // public-media.ts — every other asset id 404s identically to an unknown
  // route. This is a distinct route/path from the owner-session-protected
  // /api/media/:assetId below, which is unaffected by this addition.
  const publicMediaHandler = createPublicMediaHandler(getGateway, getDriveClient);
  app.get('/api/public-media/:assetId', publicMediaHandler);
  app.head('/api/public-media/:assetId', publicMediaHandler);

  app.post('/api/access/page-open', createPageOpenHandler(getGateway, now));

  app.post('/api/auth/gate', createGateLoginHandler(getGateway, now, cookieEnv));
  app.post('/api/auth/admin', createAdminLoginHandler(getGateway, now, cookieEnv));

  app.get('/api/session/owner', createSessionResumeHandler('owner', getGateway, now, cookieEnv));
  app.post(
    '/api/session/owner/heartbeat',
    createSessionHeartbeatHandler('owner', getGateway, now, cookieEnv),
  );
  app.delete('/api/session/owner', createSessionLogoutHandler('owner', getGateway, now, cookieEnv));

  app.get('/api/session/admin', createSessionResumeHandler('admin', getGateway, now, cookieEnv));
  app.post(
    '/api/session/admin/heartbeat',
    createSessionHeartbeatHandler('admin', getGateway, now, cookieEnv),
  );
  app.delete('/api/session/admin', createSessionLogoutHandler('admin', getGateway, now, cookieEnv));

  const requireAdmin = createAdminAuthMiddleware(getGateway, now, cookieEnv);
  app.get('/api/admin/schema-health', requireAdmin, createSchemaHealthHandler(getGateway));
  app.get('/api/admin/dashboard', requireAdmin, createAdminDashboardHandler(getGateway, now));
  app.get('/api/admin/logs', requireAdmin, createAdminLogsHandler(getGateway));
  app.get('/api/admin/players/:userId', requireAdmin, createAdminPlayerInspectHandler(getGateway));

  const requireOwner = createOwnerAuthMiddleware(getGateway, now, cookieEnv);
  app.get('/api/content/runtime', requireOwner, createContentRuntimeHandler(getGateway));

  const mediaHandler = createMediaHandler(getGateway, getDriveClient);
  app.get('/api/media/:assetId', requireOwner, mediaHandler);
  app.head('/api/media/:assetId', requireOwner, mediaHandler);

  app.get('/api/player/state', requireOwner, createPlayerStateHandler(getGateway));
  app.get('/api/player/achievements', requireOwner, createPlayerAchievementsHandler(getGateway));
  app.post('/api/player/checkpoint', requireOwner, createPlayerCheckpointHandler(getGateway, now));
  app.post(
    '/api/player/route/complete',
    requireOwner,
    createPlayerRouteCompleteHandler(getGateway, now),
  );
  // Key awards and spends are never client-callable: rewards come only from server-validated
  // world actions and the Sheet's key rules (see world/rewards.ts).
  // Achievements are likewise unlocked only by server-side triggers, never claimed by id.

  app.use(
    '/api/world',
    requireOwner,
    createWorldRouter({
      getGateway,
      mutex: playerKeyMutex,
      now,
      birthdayNow: (userId) => birthdayClock.resolve(now(), userId, birthdayReviewEnabled()),
      weather: options?.weatherProvider ?? openMeteoProvider,
    }),
  );

  app.get('/api/character/state', requireOwner, createCharacterStateHandler(getGateway));
  app.post('/api/character/name', requireOwner, createCharacterNameHandler(getGateway, now));

  // Development-only capabilities: the environment check runs BEFORE owner
  // auth, so a non-development environment 404s identically to an unknown
  // route regardless of session state — see development-only-middleware.ts.
  const requireDevelopmentEnvironment = createDevelopmentOnlyMiddleware(isDevelopmentEnvironment);
  app.get(
    '/api/dev/map-preview-assets',
    requireDevelopmentEnvironment,
    requireOwner,
    createDevMapPreviewHandler(getGateway),
  );
  // birthday_2026 (M16 narrow scope) test-clock preview: admin-only AND dev-only, never reachable in
  // a deployed/production build regardless of session. Controls ONLY the `/api/world/birthday/*`
  // routes' clock (see `birthdayNow` above) — every other route keeps using the real `now`.
  app.get(
    '/api/dev/birthday-test-clock',
    createDevelopmentOnlyMiddleware(birthdayReviewEnabled),
    requireAdmin,
    createDevBirthdayTestClockGetHandler(birthdayClock),
  );
  app.post(
    '/api/dev/birthday-test-clock',
    createDevelopmentOnlyMiddleware(birthdayReviewEnabled),
    requireAdmin,
    createDevBirthdayTestClockSetHandler(birthdayClock),
  );

  const staticRoot = options?.staticRoot;
  if (staticRoot) {
    // Same-origin static hosting for a single-process free-tier deployment.
    // Only ever reached for a non-`/api` path — every `/api/*` route above
    // (including its own 404) is matched first, so this can never shadow an
    // API response or serve the SPA shell for an unknown API call.
    app.use(express.static(staticRoot));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }

  app.use((req, res) => {
    const notFound: ApiError = {
      ok: false,
      code: 'not_found',
      message: `No route for ${req.method} ${req.path}`,
    };
    res.status(404).json(notFound);
  });

  return app;
}
