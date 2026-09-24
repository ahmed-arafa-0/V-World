import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { M02_FAKE_ADMIN_PASSWORD, M02_FAKE_GATE_CODE } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { KeyMutex } from '../src/repositories/key-mutex.js';
import { addChurchContent, buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

function makeApp() {
  const gateway = worldGateway(buildWorldWorkbook(addChurchContent));
  const app = createApp({
    getGateway: () => gateway,
    now: () => new Date('2026-09-26T10:00:00.000Z'),
    isProduction: () => false,
    playerKeyMutex: new KeyMutex(),
    weatherProvider: { rainHours: async () => [] },
  });
  return { app, gateway };
}

function cookie(setCookie: string[], name: string): string {
  return setCookie.find((c) => c.startsWith(`${name}=`))!.split(';')[0]!;
}

async function ownerCookie(app: import('express').Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/gate')
    .send({
      digits: M02_FAKE_GATE_CODE.split(''),
      deviceId: 'device_world',
      attemptId: 'world_owner',
    });
  return cookie(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

const GET_ROUTES = ['journey', 'church', 'cafe', 'arcade', 'cottage', 'farm', 'museum', 'map'];
const POST_ROUTES = [
  'journey/sync',
  'journey/ack',
  'journey/replay',
  'journey/complete',
  'church/enter',
  'church/candle',
  'church/candle/extinguish',
  'church/candle/add',
  'church/candle/remove',
  'church/quiz/answer',
  'cafe/gramophone',
  'cafe/request',
  'walkman',
  'arcade/unlock',
  'arcade/attempt',
  'arcade/recover-intro-reward',
  'cottage/enter',
  'mailbox/open',
  'marcelino/first-delivery',
  'farm/plant',
  'farm/harvest',
  'museum/verify',
  'museum/puzzle',
  'map/travel',
];

describe('World API — authorization', () => {
  it('rejects every world route without an owner session', async () => {
    const { app } = makeApp();
    for (const route of GET_ROUTES) {
      expect((await request(app).get(`/api/world/${route}`)).status, route).toBe(401);
    }
    for (const route of POST_ROUTES) {
      expect((await request(app).post(`/api/world/${route}`).send({})).status, route).toBe(401);
    }
  });

  it('does not accept an Admin session as owner authentication', async () => {
    const { app } = makeApp();
    const login = await request(app).post('/api/auth/admin').send({
      username: 'admin_fixture',
      password: M02_FAKE_ADMIN_PASSWORD,
      deviceId: 'device_world',
      attemptId: 'world_admin',
    });
    const admin = cookie(login.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
    const res = await request(app)
      .get('/api/world/journey')
      .set('Cookie', admin.replace('vw_admin_session', 'vw_owner_session'));
    expect([401, 403]).toContain(res.status);
  });
});

describe('World API — behavior', () => {
  it('reports the journey for the session user and never accepts a user id from the client', async () => {
    const { app } = makeApp();
    const cookieHeader = await ownerCookie(app);
    const res = await request(app)
      .get('/api/world/journey?userId=someone_else')
      .set('Cookie', cookieHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, routeId: 'first_journey', phase: 'original' });
    expect(res.body.currentBeat.beatId).toBe('beat_02_gate');
  });

  it('keeps the Church locked until the journey reaches it, with a safe error body', async () => {
    const { app } = makeApp();
    const c = await ownerCookie(app);
    const res = await request(app)
      .post('/api/world/church/candle')
      .set('Cookie', c)
      .send({ candleId: 'candle_1', userId: 'someone_else' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      code: 'WORLD_LOCKED',
      message: 'This place is not open yet.',
    });
  });

  it('validates request bodies and refuses to skip journey steps', async () => {
    const { app } = makeApp();
    const c = await ownerCookie(app);
    expect(
      (await request(app).post('/api/world/church/candle').set('Cookie', c).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/world/journey/replay')
          .set('Cookie', c)
          .send({ action: 'nope' })
      ).status,
    ).toBe(400);
    const skip = await request(app)
      .post('/api/world/journey/ack')
      .set('Cookie', c)
      .send({ interactionId: 'map_receive' });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe('WORLD_INVALID_STATE');
  });

  it('never leaks a raw Drive id or a placeholder in world responses', async () => {
    const { app } = makeApp();
    const c = await ownerCookie(app);
    for (const route of ['journey', 'cafe', 'museum', 'map']) {
      const res = await request(app).get(`/api/world/${route}`).set('Cookie', c);
      expect(JSON.stringify(res.body)).not.toMatch(/drive_file_id|<[A-Z_ ]+>/);
    }
  });
});
