import cors from 'cors';
import express, { type Express } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { createAdminAuthMiddleware } from './api/admin-auth-middleware.js';
import { createOwnerAuthMiddleware } from './api/owner-auth-middleware.js';
import { createPageOpenHandler } from './api/access.js';
import { createAdminLoginHandler, createGateLoginHandler } from './api/auth.js';
import { createBootstrapHandler } from './api/bootstrap.js';
import { createContentRuntimeHandler } from './api/content-runtime.js';
import { createHealthHandler, resolveEnvironment } from './api/health.js';
import { createSchemaHealthHandler } from './api/schema-health.js';
import {
  createSessionHeartbeatHandler,
  createSessionLogoutHandler,
  createSessionResumeHandler,
} from './api/session.js';
import type { CookieEnv } from './http/cookies.js';
import { getProductionGatewayOrNull } from './repositories/gateway-context.js';
import type { SheetGateway } from './repositories/sheet-gateway.js';

export interface CreateAppOptions {
  /** Defaults to the real, credential-backed production gateway (or null when unconfigured). */
  getGateway?: () => SheetGateway | null;
  /** Backend clock seam — defaults to the real wall clock. Tests inject a fake to hit exact expiry/cooldown boundaries deterministically. */
  now?: () => Date;
  /** Cookie `Secure` attribute seam — defaults to true only in the real `production` environment (compatible with plain HTTP on localhost/emulators). */
  isProduction?: () => boolean;
}

export function createApp(options?: CreateAppOptions): Express {
  const getGateway = options?.getGateway ?? getProductionGatewayOrNull;
  const now = options?.now ?? (() => new Date());
  const isProduction = options?.isProduction ?? (() => resolveEnvironment() === 'production');
  const cookieEnv = (): CookieEnv => ({ isProduction: isProduction() });

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

  const requireOwner = createOwnerAuthMiddleware(getGateway, now, cookieEnv);
  app.get('/api/content/runtime', requireOwner, createContentRuntimeHandler(getGateway));

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
