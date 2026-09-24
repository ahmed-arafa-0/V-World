import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  buildM02Workbook,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { AppError } from '../src/errors/app-error.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

function makeApp() {
  const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  const app = createApp({
    getGateway: () => gateway,
    now: () => new Date(),
    isProduction: () => false,
  });
  return { app, gateway };
}

function cookieHeaderFrom(setCookie: string[], name: string): string {
  const raw = setCookie.find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`${name} not present in Set-Cookie`);
  return raw.split(';')[0]!;
}

async function loginOwner(app: import('express').Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/gate')
    .send({ digits: CORRECT_DIGITS, deviceId: 'device_player_api', attemptId: 'player_owner' });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(app: import('express').Express): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_player_api',
    attemptId: 'player_admin',
  });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

describe('Player API — owner authorization', () => {
  it('maps a transient Sheet failure during session resolution to a safe response instead of an unhandled rejection', async () => {
    const failingGateway = {
      findByPrimaryKey: async () => {
        throw new AppError('SHEET_RATE_LIMITED', 'The Google Sheets API rate limit was exceeded.', {
          retryable: true,
        });
      },
    } as unknown as SheetGateway;
    const app = createApp({ getGateway: () => failingGateway });
    const res = await request(app)
      .get('/api/player/state')
      .set('Cookie', 'vw_owner_session=opaque_test_session');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      ok: false,
      code: 'SHEET_RATE_LIMITED',
      message: 'The Google Sheets API rate limit was exceeded.',
    });
  });

  it('GET /api/player/state rejects with 401 when no owner cookie is present', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/player/state');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('GET /api/player/achievements rejects with 401 when no owner cookie is present', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/player/achievements');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('POST /api/player/checkpoint rejects an Admin session presented via the owner cookie with 403', async () => {
    const { app } = makeApp();
    const adminCookieHeader = await loginAdmin(app);
    const adminSessionId = adminCookieHeader.split('=')[1]!;

    const res = await request(app)
      .post('/api/player/checkpoint')
      .set('Cookie', `vw_owner_session=${adminSessionId}`)
      .send({ routeId: 'r', beatId: 'b', checkpoint: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });

  it('every player mutation route requires a valid owner session', async () => {
    const { app } = makeApp();
    const routes = [['/api/player/route/complete', { routeId: 'r' }]] as const;
    for (const [path, body] of routes) {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(401);
    }
  });
});

describe('Player API — request validation', () => {
  it('rejects a request body containing a client-supplied userId — the user always comes from the session', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .post('/api/player/checkpoint')
      .set('Cookie', cookie)
      .send({ routeId: 'r', beatId: 'b', checkpoint: true, userId: 'someone_else' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
  });

  it('rejects a malformed checkpoint body', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .post('/api/player/checkpoint')
      .set('Cookie', cookie)
      .send({ routeId: 'r' });
    expect(res.status).toBe(400);
  });
});

describe('Player API — end-to-end flow with a real owner session', () => {
  it('checkpoints progress, completes a route, and reads it back', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const checkpointRes = await request(app)
      .post('/api/player/checkpoint')
      .set('Cookie', cookie)
      .send({ routeId: 'e2e_route', beatId: 'beat_01', checkpoint: true });
    expect(checkpointRes.status).toBe(200);
    expect(checkpointRes.body.ok).toBe(true);
    expect(checkpointRes.body.progress.currentBeatId).toBe('beat_01');

    const completeRes = await request(app)
      .post('/api/player/route/complete')
      .set('Cookie', cookie)
      .send({ routeId: 'e2e_route' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.progress.status).toBe('completed');

    const stateRes = await request(app).get('/api/player/state').set('Cookie', cookie);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.progress.some((p: { routeId: string }) => p.routeId === 'e2e_route')).toBe(
      true,
    );
  });

  it('GET /api/player/achievements returns a locale-resolved, catalog-joined list for the session owner', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/player/achievements').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.achievements)).toBe(true);
  });

  it('never exposes a raw Google/Sheets error or credential value in any player response', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/player/state').set('Cookie', cookie);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(M02_FAKE_GATE_CODE);
    expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
    expect(serialized).not.toMatch(/"sessionId"/);
  });
});
