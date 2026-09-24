#!/usr/bin/env node
/**
 * Small, bounded LIVE-Sheet check of the Phase 3 Admin panel additions (dashboard, log viewer,
 * player inspector) and the achievements display endpoint, against the REAL Sheet/backend. Every
 * route here is read-only. Sessions are synthesized directly (the same pattern
 * verify-phase2-live-rewards.mjs uses for an owner session) rather than a real Gate/Admin login, so
 * this never touches the real owner's (`veoulla`) session or rows, and never needs the real Admin
 * password. Not part of `npm run test`; manually invoked, once, to confirm the new reads actually
 * parse the real Sheet's real column layout (something the in-memory fixture cannot prove).
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

const now = new Date();
const expiresAt = new Date(now.getTime() + 3600_000);

const adminUserId = `phase3_admin_check_${Date.now()}`;
const adminSessionId = buildSessionId('admin', adminUserId);
await createOrReconcileSession(gateway, {
  sessionId: adminSessionId,
  userId: adminUserId,
  ip: '127.0.0.1',
  deviceId: 'phase3-admin-check',
  createdAt: now,
  expiresAt,
});

const ownerUserId = `phase3_owner_check_${Date.now()}`;
const ownerSessionId = buildSessionId('gate', ownerUserId);
await createOrReconcileSession(gateway, {
  sessionId: ownerSessionId,
  userId: ownerUserId,
  ip: '127.0.0.1',
  deviceId: 'phase3-admin-check',
  createdAt: now,
  expiresAt,
});

const app = express();
app.use(createApp());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (path, cookieName, sessionId) => {
  const res = await fetch(base + path, { headers: { Cookie: `${cookieName}=${sessionId}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

console.log('Admin dashboard, log viewer, player inspector, and achievements — live, read-only:');

const dashboard = await get('/api/admin/dashboard', 'vw_admin_session', adminSessionId);
check(
  'GET /api/admin/dashboard returns 200 with the expected shape',
  dashboard.status === 200 &&
    dashboard.body.ok === true &&
    typeof dashboard.body.serverTime === 'string' &&
    typeof dashboard.body.timeZone === 'string' &&
    typeof dashboard.body.schemaHealth?.expectedTabCount === 'number' &&
    typeof dashboard.body.activeSessionCount === 'number' &&
    Array.isArray(dashboard.body.lastLogs),
  dashboard.body,
);
check(
  'dashboard.activeSessionCount includes the session this script just created',
  dashboard.body.activeSessionCount >= 1,
  dashboard.body.activeSessionCount,
);

const logs = await get('/api/admin/logs?limit=5', 'vw_admin_session', adminSessionId);
check(
  'GET /api/admin/logs returns 200 with rows/total',
  logs.status === 200 && Array.isArray(logs.body.rows) && typeof logs.body.total === 'number',
  logs.body,
);

const player = await get(
  `/api/admin/players/${encodeURIComponent(ownerUserId)}`,
  'vw_admin_session',
  adminSessionId,
);
check(
  'GET /api/admin/players/:userId returns 200 with the aggregate shape for a fresh, isolated user',
  player.status === 200 &&
    player.body.userId === ownerUserId &&
    Array.isArray(player.body.progress) &&
    Array.isArray(player.body.keys) &&
    Array.isArray(player.body.achievements) &&
    Array.isArray(player.body.scores) &&
    Array.isArray(player.body.messages) &&
    typeof player.body.worldDocs === 'object',
  player.body,
);

const adminOverOwner = await get('/api/admin/dashboard', 'vw_admin_session', ownerSessionId);
check(
  'an owner session presented as the Admin cookie is rejected, not honoured',
  adminOverOwner.status === 401 || adminOverOwner.status === 403,
  adminOverOwner,
);

const unauth = await get('/api/admin/dashboard', 'vw_admin_session', 'not-a-real-session');
check('an invalid Admin cookie is rejected', unauth.status === 401, unauth);

const achievements = await get(
  '/api/player/achievements?locale=en',
  'vw_owner_session',
  ownerSessionId,
);
check(
  'GET /api/player/achievements returns 200 with a locale-resolved catalog join for a fresh owner session',
  achievements.status === 200 && Array.isArray(achievements.body.achievements),
  achievements.body,
);
if (achievements.status === 200) {
  const anySecretRevealsNothing = achievements.body.achievements
    .filter((a) => a.secret && a.status === 'locked')
    .every((a) => a.title === '' && a.description === '' && a.iconRef === null && a.points === 0);
  check('a still-locked secret achievement reveals nothing over the wire', anySecretRevealsNothing);
}

console.log(failed === 0 ? `\nAll checks passed.` : `\n${failed} check(s) FAILED.`);
server.close();
process.exit(failed === 0 ? 0 : 1);
