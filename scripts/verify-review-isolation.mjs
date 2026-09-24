import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../apps/functions/lib/app.js';
import { createReviewGateway, REVIEW_STATE_TABS } from './review-isolation.mjs';
import { startPhase2Fixture, M02_FAKE_GATE_CODE } from './lib/phase2-fixture.mjs';
import { mutateWorldDoc, readWorldDoc } from '../apps/functions/lib/world/state.js';
import { KeyMutex } from '../apps/functions/lib/repositories/key-mutex.js';
const f = await startPhase2Fixture();
const userId = 'manual_review_987654321';
const scoped = createReviewGateway(f.gateway, userId);
const server = http.createServer(
  createApp({
    getGateway: () => scoped,
    getDriveClient: () => null,
    isProduction: () => false,
    getEnvironment: () => 'local',
  }),
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const before = {};
  for (const tab of REVIEW_STATE_TABS)
    before[tab] = JSON.stringify((await f.gateway.readTab(tab)).rows);
  const login = async (code, id) => {
    const r = await fetch(`${origin}/api/auth/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digits: code.split(''), deviceId: 'review-isolation', attemptId: id }),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  };
  const wrong = await login('9999', 'wrong-review');
  assert.equal(wrong.status, 401);
  const right = await login(M02_FAKE_GATE_CODE, 'right-review');
  assert.equal(right.status, 200);
  assert.equal(right.body.session.userId, userId);
  const state = await (
    await fetch(`${origin}/api/player/state`, { headers: { Cookie: right.cookie } })
  ).json();
  assert.deepEqual(state.progress, []);
  for (const tab of REVIEW_STATE_TABS)
    assert.equal(JSON.stringify((await f.gateway.readTab(tab)).rows), before[tab]);
  await assert.rejects(scoped.appendRow('25_PLAYER_KEYS', { user_id: 'veoulla' }), /isolation/);
  await assert.rejects(
    scoped.updateByPrimaryKey('02_USERS', 'veoulla', { active: 'FALSE' }),
    /isolation/,
  );
  await assert.rejects(scoped.appendRowsIfAbsent('10_ASSETS', [{ asset_id: 'no' }]), /isolation/);
  await assert.rejects(
    scoped.appendIfAbsent('37_CHARACTER_STATE', 'veoulla|var', () => ({ user_id: 'veoulla' })),
    /isolation/,
  );
  assert.throws(() => createReviewGateway(f.gateway, 'veoulla'), /identity/);
  const missing = await scoped.findFresh('37_CHARACTER_STATE', `${userId}|world_church`);
  assert.equal(missing.found, null);
  assert.ok(Array.isArray(missing.raw));
  const ctx = { gateway: scoped, userId, now: new Date(), mutex: new KeyMutex() };
  await mutateWorldDoc(ctx, 'church', async (doc) => {
    await new Promise((resolve) => setTimeout(resolve, 170)); // Force the actual optimistic fresh-read branch.
    doc.visited = true;
  });
  await mutateWorldDoc(ctx, 'church', async (doc) => {
    await new Promise((resolve) => setTimeout(resolve, 170));
    doc.candlesLitEver = 1;
  });
  assert.equal((await readWorldDoc(scoped, userId, 'church')).candlesLitEver, 1);
  await f.gateway.appendRow('37_CHARACTER_STATE', {
    user_character_key: 'veoulla|world_church',
    user_id: 'veoulla',
    character_id: 'world_church',
    story_flags_json: '{}',
  });
  await assert.rejects(scoped.findFresh('37_CHARACTER_STATE', 'veoulla|world_church'), /isolation/);
  const foreign = await f.gateway.findByPrimaryKey('37_CHARACTER_STATE', 'veoulla|world_church');
  await assert.rejects(
    scoped.updateByPrimaryKey(
      '37_CHARACTER_STATE',
      'veoulla|world_church',
      { user_id: userId },
      foreign,
    ),
    /isolation/,
  );
  console.log(
    'PASS fresh lookup present/absent; slow mutation consistency checks; foreign fresh/known-row writes rejected.',
  );
  console.log(
    'PASS wrong Gate code rejected; correct code creates only isolated session; fresh gameplay empty; owner/config/asset writes rejected.',
  );
} finally {
  server.close();
  f.server.close();
}
