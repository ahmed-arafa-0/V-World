import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { BackendEnvironment } from '@veoullas-world/contracts';
import { M02_FAKE_ADMIN_PASSWORD, M02_FAKE_GATE_CODE } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { createOrReconcileSession } from '../src/services/session.service.js';
import { addBirthdayFixtures, buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

const REVIEW_USER = 'manual_review_bday_api_test';
const ROUTE = '/api/dev/birthday-test-clock';
const REAL_NOW = new Date('2026-09-24T10:00:00.000Z'); // well before target_at (before-window)

function makeApp(environment: BackendEnvironment, configured = true) {
  const gateway = worldGateway(buildWorldWorkbook(addBirthdayFixtures));
  const app = createApp({
    getGateway: () => gateway,
    birthdayReviewUserId: configured ? REVIEW_USER : undefined,
    now: () => REAL_NOW,
    isProduction: () => environment === 'production',
    getEnvironment: () => environment,
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
    .send({
      digits: M02_FAKE_GATE_CODE.split(''),
      deviceId: 'device_bday_clock',
      attemptId: 'bc_owner',
    });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(app: import('express').Express): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_bday_clock',
    attemptId: 'bc_admin',
  });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

describe('birthday-test-clock route — development-only environment boundary', () => {
  it('404s in production for an unauthenticated request — indistinguishable from an unknown route', async () => {
    const { app } = makeApp('production');
    const res = await request(app).get(ROUTE);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('404s in production even with a valid admin session — the environment check runs before auth', async () => {
    const { app } = makeApp('production');
    const cookie = await loginAdmin(app);
    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('404s in staging — staging is not treated as a development environment', async () => {
    const { app } = makeApp('staging');
    const cookie = await loginAdmin(app);
    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('birthday-test-clock route — admin authorization still applies in development', () => {
  it('rejects with 401 when no admin cookie is present, in local', async () => {
    const { app } = makeApp('local');
    const res = await request(app).get(ROUTE);
    expect(res.status).toBe(401);
  });

  it('rejects an owner session presented via the admin cookie with 403, not 200', async () => {
    const { app } = makeApp('local');
    const ownerCookieHeader = await loginOwner(app);
    const ownerSessionId = ownerCookieHeader.split('=')[1]!;
    const res = await request(app).get(ROUTE).set('Cookie', `vw_admin_session=${ownerSessionId}`);
    expect(res.status).toBe(403);
  });
});

describe('birthday-test-clock route — reading and setting the offset, in local', () => {
  it('starts with no override, accepts a numeric offset, and clearing it with null works', async () => {
    const { app } = makeApp('local');
    const admin = await loginAdmin(app);

    const initial = await request(app).get(ROUTE).set('Cookie', admin);
    expect(initial.body).toEqual({ ok: true, offsetMs: null });

    const setRes = await request(app).post(ROUTE).set('Cookie', admin).send({ offsetMs: 60_000 });
    expect(setRes.status).toBe(200);
    expect(setRes.body).toEqual({ ok: true, offsetMs: 60_000 });

    const readBack = await request(app).get(ROUTE).set('Cookie', admin);
    expect(readBack.body).toEqual({ ok: true, offsetMs: 60_000 });

    const cleared = await request(app).post(ROUTE).set('Cookie', admin).send({ offsetMs: null });
    expect(cleared.body).toEqual({ ok: true, offsetMs: null });
  });

  it('rejects a non-numeric, non-null offsetMs with 400', async () => {
    const { app } = makeApp('local');
    const admin = await loginAdmin(app);
    const res = await request(app).post(ROUTE).set('Cookie', admin).send({ offsetMs: 'soon' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
  });
});

describe('birthday-test-clock — event-scoped effect on /api/world/birthday only', () => {
  it('with no offset, /api/world/birthday reports the real serverNow and the "before" window', async () => {
    const { app } = makeApp('local');
    const owner = await loginOwner(app);
    const res = await request(app).get('/api/world/birthday').set('Cookie', owner);
    expect(res.body.serverNow).toBe(REAL_NOW.toISOString());
    expect(res.body.window).toBe('before');
  });

  it('setting an offset shifts /api/world/birthday into the live window, crossing the real boundary', async () => {
    const { app, gateway } = makeApp('local');
    const admin = await loginAdmin(app);
    const owner = await loginReview(gateway);

    // REAL_NOW is 2026-09-24T10:00Z; target_at is 2026-09-25T21:00Z (26 Sep 00:00 Africa/Cairo).
    // Shift by +2 days to land inside the live window without moving the real clock at all.
    await request(app)
      .post('/api/dev/birthday-test-clock')
      .set('Cookie', admin)
      .send({ offsetMs: 2 * 24 * 60 * 60 * 1000 });

    const res = await request(app).get('/api/world/birthday').set('Cookie', owner);
    expect(res.body.window).toBe('live');
    expect(res.body.serverNow).toBe('2026-09-26T10:00:00.000Z');
  });

  it('never affects an unrelated world route (journey) — the override is birthday-scoped only', async () => {
    const { app, gateway } = makeApp('local');
    const admin = await loginAdmin(app);
    const owner = await loginReview(gateway);
    await request(app)
      .post('/api/dev/birthday-test-clock')
      .set('Cookie', admin)
      .send({ offsetMs: 30 * 24 * 60 * 60 * 1000 }); // +30 days

    const checkpoint = await request(app)
      .post('/api/player/checkpoint')
      .set('Cookie', owner)
      .send({ routeId: 'first_journey', beatId: 'beat_05_beach', checkpoint: true });
    expect(checkpoint.status).toBe(200);

    const progress = await gateway.readTab('24_PLAYER_PROGRESS', { bypass: true });
    const row = progress.rows.find(
      (r) => r.raw.user_id === REVIEW_USER && r.raw.story_route_id === 'first_journey',
    );
    // The stamped timestamp must reflect the REAL clock, never the birthday-only +30-day offset —
    // proving the override never leaks past the birthday routes into an unrelated world route.
    expect(row?.raw.updated_at).toBe(REAL_NOW.toISOString());
  });
});

async function loginReview(gateway: ReturnType<typeof worldGateway>) {
  const sessionId = 'sess_gate_review_clock';
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: REVIEW_USER,
    ip: '127.0.0.1',
    deviceId: 'test',
    createdAt: REAL_NOW,
    expiresAt: new Date(REAL_NOW.getTime() + 3600_000),
  });
  return `vw_owner_session=${sessionId}`;
}
it('shared local preview has no clock route without explicit review configuration', async () => {
  const { app } = makeApp('local', false);
  expect((await request(app).post(ROUTE).send({ offsetMs: 1 })).status).toBe(404);
});
it('owner and another app keep real birthday time while the designated review shifts', async () => {
  const { app, gateway } = makeApp('local');
  const admin = await loginAdmin(app);
  await request(app)
    .post(ROUTE)
    .set('Cookie', admin)
    .send({ offsetMs: 2 * 86400_000 });
  const owner = await loginOwner(app);
  expect((await request(app).get('/api/world/birthday').set('Cookie', owner)).body.serverNow).toBe(
    REAL_NOW.toISOString(),
  );
  const review = await loginReview(gateway);
  expect((await request(app).get('/api/world/birthday').set('Cookie', review)).body.window).toBe(
    'live',
  );
  const other = makeApp('local');
  const otherReview = await loginReview(other.gateway);
  expect(
    (await request(other.app).get('/api/world/birthday').set('Cookie', otherReview)).body.serverNow,
  ).toBe(REAL_NOW.toISOString());
  expect((await request(app).get('/api/session/owner').set('Cookie', review)).status).toBe(200);
});
