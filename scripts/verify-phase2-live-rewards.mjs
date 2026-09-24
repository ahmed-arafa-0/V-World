#!/usr/bin/env node
/**
 * LIVE-Sheet check of the Phase 2 reward lockdown (one isolated, generated test
 * user; the real owner's rows are never read or written for this user). Proves,
 * against the real backend and real Sheet: the retired client-chosen endpoints
 * are gone, the Beach shell is refused before the Gate/naming flow is finished,
 * pays the Sheet-configured key exactly once, ignores any key/quantity in the
 * request, and cannot be replayed. Manually invoked; not part of `npm run test`.
 */
import http from 'node:http';
import express from 'express';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const gateway = getProductionGatewayOrNull();
if (!gateway) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const userId = `phase2_lockdown_${Date.now()}`;
const sessionId = buildSessionId('gate', userId);
const now = new Date();
await createOrReconcileSession(gateway, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: 'phase2-lockdown',
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600_000),
});
const app = express();
app.use(createApp());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (path, body = {}) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `vw_owner_session=${sessionId}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const pause = () => new Promise((r) => setTimeout(r, 1500));

for (const [route, body] of [
  ['/api/player/keys/award', { keyTypeId: 'key_everkeep', quantity: 9, transactionId: 'x' }],
  ['/api/player/keys/spend', { keyTypeId: 'key_shell', quantity: 1, transactionId: 'x' }],
  ['/api/player/achievements/claim', { achievementId: 'ach_secret_001' }],
]) {
  const r = await post(route, body);
  check(`${route} is retired (404)`, r.status === 404, r);
  await pause();
}
const early = await post('/api/world/beach/shell', { keyTypeId: 'key_everkeep', quantity: 9 });
check('Beach shell refused before the Gate/naming flow is finished', early.status === 403, early);
await pause();
await gateway.appendRow('24_PLAYER_PROGRESS', {
  user_route_key: `${userId}|first_opening`,
  user_id: userId,
  story_route_id: 'first_opening',
  status: 'in_progress',
  current_beat_id: 'naming_complete',
  updated_at: now.toISOString(),
});
const first = await post('/api/world/beach/shell', { keyTypeId: 'key_everkeep', quantity: 9 });
check(
  'pays the Sheet-configured Beach key once, ignoring the request body',
  first.status === 200 && first.body.applied === true && first.body.keyTypeId === 'key_shell',
  first,
);
await pause();
const again = await post('/api/world/beach/shell');
check(
  'a replay pays nothing',
  again.body.applied === false && again.body.reason === 'already_claimed',
  again,
);
await pause();
const keys = (await gateway.readTab('25_PLAYER_KEYS', { bypass: true })).rows.filter(
  (r) => r.raw.user_id === userId,
);
check(
  'exactly one key row for the test user: shell x1, no Everkeep key',
  keys.length === 1 &&
    keys[0].raw.key_type_id === 'key_shell' &&
    keys[0].raw.quantity_found === '1',
  keys.map((k) => k.raw),
);
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nLive reward lockdown verified (isolated user).');
process.exit(failed ? 1 : 0);
