#!/usr/bin/env node
/**
 * Local, non-deployed preview server: the REAL built React app
 * (apps/web/dist) served same-origin alongside the REAL backend
 * (createApp() — real Sheet + read-only Drive credential), exactly like
 * the live-verification scripts already use. Never deploys anything —
 * purely local. Run `npm run build` first so apps/web/dist is current.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from '../apps/functions/lib/app.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(dirname, '..', 'apps', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 5050);

if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  console.error(`BLOCKER: ${webDist} has no index.html — run "npm run build" first.`);
  process.exit(1);
}

// A transient live-Sheet quota error (429) inside a request must not take the whole preview down.
process.on('unhandledRejection', (err) => {
  console.error('[preview] unhandled rejection (kept running):', err?.code ?? err?.message ?? err);
});

const backend = createApp();
const app = express();
app.use(express.static(webDist));
app.use(backend);

const server = http.createServer(app);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local preview running at: http://127.0.0.1:${PORT}`);
  console.log('Real backend, real Sheet, real (read-only) Drive credential — nothing deployed.');
  console.log('Press Ctrl+C to stop.');
});
