#!/usr/bin/env node
/**
 * Phase 1 item D live verification: exercises the real /api/player/* API
 * against the REAL Google Sheet (not a fake client) — proving the fake
 * client used in the unit/integration test suite behaves identically to
 * the real Sheets API for player-state reads/writes.
 *
 * Uses a clearly-isolated, obviously-fake `userId` for a minted (never
 * Gate-code-derived) owner session, so every row this script writes is
 * keyed `phase1_d_verification_user|...` — never `veoulla|...`. This never
 * reads or writes Ahmed's/Veoulla's real one-time rewards or progress.
 * These test rows are NOT cleaned up afterward (the Sheet gateway exposes
 * no delete operation) — they remain in the live Sheet exactly the way
 * this project's other live verification scripts already leave clearly-
 * labeled test rows (e.g. `05_ENTRY_LOGS`/`06_SESSIONS` fixtures from
 * M02/M03 live scripts).
 */
import http from 'node:http';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const TEST_USER_ID = 'phase1_d_verification_user';

let passCount = 0;
let failCount = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
    failCount++;
  }
}

async function main() {
  const gateway = getProductionGatewayOrNull();
  if (!gateway) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }

  // Timestamped so a rerun always mints a fresh, valid session rather than
  // silently reusing (and never refreshing the expiry of) an old run's now-
  // possibly-expired row — `createOrReconcileSession` is idempotent BY
  // attempt id.
  const sessionId = buildSessionId('gate', `phase1_d_player_state_verification_${Date.now()}`);
  const now = new Date();
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: TEST_USER_ID,
    ip: '127.0.0.1',
    deviceId: 'phase1-d-verification',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
  console.log(`Isolated test user: ${TEST_USER_ID} (never "veoulla")\n`);

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const cookie = `vw_owner_session=${sessionId}`;

  async function post(path, body) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  async function get(path) {
    const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
    return { status: res.status, body: await res.json() };
  }

  const runId = String(Date.now());
  const routeId = `phase1_d_verify_route_${runId}`;
  const keyTypeId = `phase1_d_verify_key_${runId}`;
  const achievementId = `phase1_d_verify_ach_${runId}`;

  console.log('=== Checkpoint (real Sheet) ===');
  const checkpointRes = await post('/api/player/checkpoint', {
    routeId,
    beatId: 'beat_01',
    checkpoint: true,
  });
  check(
    '200 + applied',
    checkpointRes.status === 200 && checkpointRes.body.applied,
    checkpointRes.body,
  );
  check(
    'current beat recorded correctly',
    checkpointRes.body.progress?.currentBeatId === 'beat_01',
    checkpointRes.body,
  );

  console.log('\n=== Client-chosen rewards are retired (Phase 2 closure) ===');
  for (const [route, body] of [
    ['/api/player/keys/award', { keyTypeId, quantity: 1, transactionId: `${runId}_a1` }],
    ['/api/player/keys/spend', { keyTypeId, quantity: 1, transactionId: `${runId}_s1` }],
    ['/api/player/achievements/claim', { achievementId }],
  ]) {
    const res = await post(route, body);
    check(`${route} is gone (404)`, res.status === 404, res.body);
  }

  console.log('\n=== Route completion (real Sheet) ===');
  const completeRes = await post('/api/player/route/complete', { routeId });
  check(
    'route completes',
    completeRes.status === 200 && completeRes.body.progress?.status === 'completed',
    completeRes.body,
  );

  console.log('\n=== Consolidated state read survives a fresh request (real Sheet) ===');
  const stateRes = await get('/api/player/state');
  check(
    'progress reflects the writes above',
    stateRes.status === 200 &&
      stateRes.body.progress.some((p) => p.routeId === routeId && p.status === 'completed'),
    stateRes.body,
  );

  server.close();

  console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.error('\nPHASE 1 ITEM D LIVE VERIFICATION FAILED.');
    process.exit(1);
  }
  console.log(
    '\nPHASE 1 ITEM D LIVE VERIFICATION PASSED (against the real Sheet, isolated test user).',
  );
}

main().catch((err) => {
  console.error('\nPhase 1 item D live verification crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
