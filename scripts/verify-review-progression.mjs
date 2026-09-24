import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture } from './lib/phase2-fixture.mjs';
import {
  createOrReconcileSession,
  buildSessionId,
} from '../apps/functions/lib/services/session.service.js';
const fix = process.argv.includes('--fixed');
const f = await startPhase2Fixture({ artPack: true });
const source = JSON.parse(
  fs.readFileSync('test-results/review-repair/blocked-owner-clone-source.json'),
);
const userId = `manual_review_${Date.now()}`;
for (const [tab, rows] of Object.entries(source))
  for (const raw of rows) {
    const r = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [
        k,
        k === 'user_id' ? userId : v.replaceAll('veoulla|', `${userId}|`),
      ]),
    );
    await f.gateway.appendRow(tab, r);
  }
const now = new Date(),
  sessionId = buildSessionId('gate', `isolated_repro_${Date.now()}`);
await createOrReconcileSession(f.gateway, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: 'isolated-repro',
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600000),
});
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addCookies([
  { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
]);
const p = await c.newPage(),
  evidence = [];
p.on('response', async (r) => {
  if (/\/api\/world\/(museum|journey)/.test(r.url()))
    evidence.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      body: await r.json().catch(() => null),
    });
});
try {
  await p.goto(f.origin);
  await p.getByTestId('museum-gate').click();
  await expect(p.getByTestId('socket-key_token')).toBeDisabled();
  await expect(p.getByTestId('museum-verify')).toBeDisabled();
  if (!fix) await p.screenshot({ path: 'test-results/review-repair/original-museum-block.png' });
  if (fix) {
    await p.route(
      '**/api/world/arcade/recover-intro-reward',
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            code: 'SHEET_UNAVAILABLE',
            message: 'Temporary failure',
          }),
        }),
      { times: 1 },
    );
    await p.getByTestId('museum-retry-rewards').click();
    await expect(p.getByTestId('museum-reward-feedback')).not.toBeEmpty();
    await expect(p.getByTestId('socket-key_token')).toBeDisabled();
    await expect(p.getByTestId('museum-verify')).toBeDisabled();
    await p.getByTestId('museum-retry-rewards').click();
    await expect(p.getByTestId('socket-key_token')).toBeEnabled();
    for (const key of ['shell', 'candle', 'music', 'token', 'letter', 'sunflower'])
      await p.getByTestId(`socket-key_${key}`).click();
    await p.getByTestId('museum-solve').click();
    await expect(p.getByTestId('museum-verify')).toBeEnabled();
    await p.getByTestId('museum-verify').click();
    await expect(p.getByTestId('museum-hall')).toBeVisible();
    await p.screenshot({ path: 'test-results/review-repair/repaired-museum-hall.png' });
  }
  console.log(
    fix
      ? 'PASS saved-win recovery, key puzzle and Museum Hall via normal clicks.'
      : 'PASS reproduced missing token / disabled Museum gate on isolated copy of recent owner state.',
  );
} finally {
  fs.writeFileSync(
    `test-results/review-repair/${fix ? 'repaired' : 'original'}-museum-network.json`,
    JSON.stringify(evidence, null, 2),
  );
  await b.close();
  f.server.close();
}
