import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

/**
 * Entry point for a free-tier Node host with no Firebase Hosting rewrite
 * available (e.g. Render) — serves the built frontend (`apps/web/dist`) and
 * the same `/api/**` Express app from one process on one origin, so the
 * existing `sameSite: 'lax'` session cookies keep working unchanged. The
 * Firebase Functions path (`index.ts` → `onRequest`) is untouched and stays
 * fully usable if Firebase Hosting/Functions is used instead.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = process.env.STATIC_ROOT
  ? path.resolve(process.env.STATIC_ROOT)
  : path.join(__dirname, '../../web/dist');

const port = process.env.PORT ? Number(process.env.PORT) : 5001;
// This entry point always serves a deployment, even if the host omits NODE_ENV.
process.env.NODE_ENV = 'production';
const app = createApp({ staticRoot, getEnvironment: () => 'production', isProduction: () => true });

// Explicit '0.0.0.0': Render (and most container-style hosts) route
// external traffic to the service on this host, and localhost/127.0.0.1
// only accepts loopback connections — the app would build and start but
// never actually be reachable. Node's own listen() default already
// resolves to all interfaces with no host argument, but this makes the
// externally-reachable bind an explicit fact, not an implementation detail.
app.listen(port, '0.0.0.0', () => {
  console.log(`[functions] production server listening on 0.0.0.0:${port}`);
  console.log(`[functions] serving static frontend from ${staticRoot}`);
});
