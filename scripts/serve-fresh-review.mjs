#!/usr/bin/env node
/** Dedicated loopback review, with normal Gate authentication and no seeded gameplay. */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { createReviewGateway, REVIEW_STATE_TABS } from './review-isolation.mjs';
if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE || process.env.FUNCTION_TARGET)
  throw Error('Local review only.');
const manifest = 'test-results/review-repair/fresh-review.json';
fs.mkdirSync(path.dirname(manifest), { recursive: true });
const saved = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : null;
const userId = saved?.userId ?? `manual_review_${Date.now()}`;
const source = getProductionGatewayOrNull();
if (!source) throw Error('Local backend credential unavailable.');
if (!saved) {
  const snapshot = { userId, createdAt: new Date().toISOString(), tables: {} };
  for (const tab of REVIEW_STATE_TABS) {
    snapshot.tables[tab] = (await source.readTab(tab)).rows
      .filter((r) => r.raw.user_id === userId)
      .map((r) => r.raw);
    if (snapshot.tables[tab].length) throw Error('New identity collision; no state changed.');
  }
  fs.writeFileSync(manifest, JSON.stringify(snapshot, null, 2));
}
const requests = new AsyncLocalStorage();
const isolated = createReviewGateway(source, userId);
const gateway = new Proxy(isolated, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value !== 'function') return value;
    return (...args) => {
      const started = Date.now();
      const result = value(...args);
      if (!result?.then) return result;
      return result.then(
        (answer) => {
          if (['appendRow', 'updateByPrimaryKey', 'appendIfAbsent'].includes(prop))
            console.log(
              JSON.stringify({
                event: 'review-write',
                request: requests.getStore(),
                method: prop,
                tab: args[0],
                elapsedMs: Date.now() - started,
                outcome: 'confirmed',
              }),
            );
          return answer;
        },
        (error) => {
          console.error(
            JSON.stringify({
              event: 'review-gateway-error',
              request: requests.getStore(),
              method: prop,
              tab: args[0],
              elapsedMs: Date.now() - started,
              code: error.code,
              name: error.name,
              message: error instanceof TypeError ? error.message : undefined,
            }),
          );
          throw error;
        },
      );
    };
  },
});
const app = express();
let sequence = 0;
app.use((req, res, next) => {
  res.setHeader('X-Review-Player', userId);
  const request = `review-${++sequence}`;
  res.setHeader('X-Review-Request', request);
  const started = Date.now();
  const requestPath = req.path;
  res.on('finish', () => {
    if (requestPath.startsWith('/api/') && !requestPath.startsWith('/api/media/'))
      console.log(
        JSON.stringify({
          event: 'review-request',
          request,
          player: res.locals.ownerUserId ?? userId,
          method: req.method,
          path: requestPath,
          status: res.statusCode,
          elapsedMs: Date.now() - started,
        }),
      );
  });
  requests.run(request, next);
});
app.use('/api/admin', (_req, res) => res.sendStatus(404));
app.use('/api/auth/admin', (_req, res) => res.sendStatus(404));
app.use(express.static(path.resolve('apps/web/dist')));
app.use(
  createApp({
    getGateway: () => gateway,
    getEnvironment: () => 'local',
    isProduction: () => false,
  }),
);
app.get('*', (_req, res) => res.sendFile(path.resolve('apps/web/dist/index.html')));
const server = app.listen(5051, '127.0.0.1', () =>
  console.log(`Review ${userId}: http://localhost:5051 — normal Gate code, isolated gameplay.`),
);
if (process.argv.includes('--open')) await import('./open-fresh-review.mjs');
process.on('SIGTERM', () => server.close());
