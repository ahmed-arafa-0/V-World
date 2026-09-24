import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { M02_FAKE_GATE_CODE, M02_OWNER_USER_ID } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { getPlayerKeys } from '../src/services/player-keys.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

function setup() {
  const gateway = worldGateway(buildWorldWorkbook());
  const app = createApp({
    getGateway: () => gateway,
    now: () => new Date('2026-09-26T10:00:00.000Z'),
    isProduction: () => false,
    weatherProvider: { rainHours: async () => [] },
  });
  return { app, gateway };
}
async function login(app: import('express').Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/gate')
    .send({ digits: M02_FAKE_GATE_CODE.split(''), deviceId: 'd', attemptId: 'lockdown' });
  return (res.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('vw_owner_session='))!
    .split(';')[0]!;
}
async function finishNaming(gateway: ReturnType<typeof worldGateway>) {
  await gateway.appendRow('24_PLAYER_PROGRESS', {
    user_route_key: `${M02_OWNER_USER_ID}|first_opening`,
    user_id: M02_OWNER_USER_ID,
    story_route_id: 'first_opening',
    status: 'in_progress',
    current_beat_id: 'naming_complete',
  });
}
const keys = async (g: ReturnType<typeof worldGateway>) => getPlayerKeys(g, M02_OWNER_USER_ID);

describe('client-chosen rewards are gone', () => {
  it.each([
    ['/api/player/keys/award', { keyTypeId: 'key_everkeep', quantity: 99, transactionId: 'x' }],
    ['/api/player/keys/spend', { keyTypeId: 'key_shell', quantity: 1, transactionId: 'x' }],
    ['/api/player/achievements/claim', { achievementId: 'ach_secret_001' }],
  ])('%s no longer exists, even for an authenticated owner', async (path, body) => {
    const { app, gateway } = setup();
    const cookie = await login(app);
    const res = await request(app).post(path).set('Cookie', cookie).send(body);
    expect(res.status).toBe(404);
    expect(await keys(gateway)).toEqual([]);
  });
});

describe('Beach signature (the only formerly client-awarded key)', () => {
  it('is refused before the Gate/naming flow is finished', async () => {
    const { app, gateway } = setup();
    const cookie = await login(app);
    const res = await request(app).post('/api/world/beach/shell').set('Cookie', cookie).send({});
    expect(res.status).toBe(403);
    expect(await keys(gateway)).toEqual([]);
  });

  it('pays the Sheet-configured key once; a body-supplied key/quantity is ignored; repeats never duplicate', async () => {
    const { app, gateway } = setup();
    const cookie = await login(app);
    await finishNaming(gateway);
    const first = await request(app)
      .post('/api/world/beach/shell')
      .set('Cookie', cookie)
      .send({ keyTypeId: 'key_everkeep', quantity: 50 });
    expect(first.body).toMatchObject({ applied: true, keyTypeId: 'key_shell', reason: 'awarded' });
    const again = await request(app).post('/api/world/beach/shell').set('Cookie', cookie).send({});
    expect(again.body).toMatchObject({ applied: false, reason: 'already_claimed' });
    const owned = await keys(gateway);
    expect(owned.map((k) => [k.keyTypeId, k.quantityFound])).toEqual([['key_shell', 1]]);
  });

  it('does not pay a second shell to a player who received one through the retired endpoint', async () => {
    const { app, gateway } = setup();
    const cookie = await login(app);
    await finishNaming(gateway);
    await gateway.appendRow('25_PLAYER_KEYS', {
      user_key_type: `${M02_OWNER_USER_ID}|key_shell`,
      user_id: M02_OWNER_USER_ID,
      key_type_id: 'key_shell',
      quantity_found: '1',
      quantity_spent: '0',
      quantity_available: '1',
      last_award_date: '2026-09-01',
      last_source_id: 'first_opening_beach_shell_v1',
    });
    const res = await request(app).post('/api/world/beach/shell').set('Cookie', cookie).send({});
    expect(res.body.applied).toBe(false);
    expect((await keys(gateway))[0]!.quantityFound).toBe(1);
  });

  it('pays nothing when the Sheet rule is disabled', async () => {
    const { app, gateway } = setup();
    const cookie = await login(app);
    await finishNaming(gateway);
    await gateway.updateByPrimaryKey('22_KEY_RULES', 'rule_first_shell', { enabled: 'FALSE' });
    const res = await request(app).post('/api/world/beach/shell').set('Cookie', cookie).send({});
    expect(res.body.applied).toBe(false);
    expect(await keys(gateway)).toEqual([]);
  });
});
