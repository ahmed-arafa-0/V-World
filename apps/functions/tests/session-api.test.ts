import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  buildM02Workbook,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

function makeApp(nowIso = '2026-01-01T00:00:00.000Z') {
  const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  let current = new Date(nowIso);
  const app = createApp({
    getGateway: () => gateway,
    now: () => current,
    isProduction: () => false,
  });
  return {
    app,
    gateway,
    setNow: (iso: string) => {
      current = new Date(iso);
    },
  };
}

function cookieHeaderFrom(setCookie: string[], name: string): string {
  const raw = setCookie.find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`${name} not present in Set-Cookie`);
  return raw.split(';')[0]!;
}

async function loginOwner(
  app: import('express').Express,
  attemptId = 'owner_login',
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/gate')
    .send({ digits: CORRECT_DIGITS, deviceId: 'device_session_1', attemptId });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(
  app: import('express').Express,
  attemptId = 'admin_login',
): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_session_1',
    attemptId,
  });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

async function readEntryLogs(gateway: SheetGateway) {
  const raw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
  const [header, ...rows] = raw;
  return rows.map((r) => Object.fromEntries(header!.map((c, i) => [c, r[i]])));
}

describe('GET /api/session/owner (resume)', () => {
  it('returns SESSION_REQUIRED with no cookie', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/session/owner');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('resumes a valid session and returns a safe summary without a session ID', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const res = await request(app).get('/api/session/owner').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({
      kind: 'owner',
      userId: 'owner_fixture',
      status: 'active',
    });
    expect(res.body.session).not.toHaveProperty('sessionId');
  });

  it('updates last_seen_at on resume', async () => {
    const { app, setNow } = makeApp('2026-01-01T00:00:00.000Z');
    const cookie = await loginOwner(app);

    setNow('2026-01-01T00:10:00.000Z');
    const res = await request(app).get('/api/session/owner').set('Cookie', cookie);
    expect(res.body.session.lastSeenAt).toBe('2026-01-01T00:10:00.000Z');
  });

  it('logs session_resume once per resumeOperationId and does not duplicate on retry', async () => {
    const { app, gateway } = makeApp();
    const cookie = await loginOwner(app);

    await request(app).get('/api/session/owner?resumeOperationId=resop1').set('Cookie', cookie);
    await request(app).get('/api/session/owner?resumeOperationId=resop1').set('Cookie', cookie);

    const logs = await readEntryLogs(gateway);
    const matches = logs.filter((r) => r.log_id === 'log_session_resume_owner_resop1');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.event_type).toBe('session_resume');
  });

  it('rejects (SESSION_FORBIDDEN, 403) when an owner session ID is presented in the admin cookie', async () => {
    const { app } = makeApp();
    const ownerCookieHeader = await loginOwner(app);
    const ownerSessionId = ownerCookieHeader.split('=')[1]!;

    const res = await request(app)
      .get('/api/session/admin')
      .set('Cookie', `vw_admin_session=${ownerSessionId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });

  it('clears the cookie and returns SESSION_EXPIRED once past the absolute expiry', async () => {
    const { app, setNow } = makeApp('2026-01-01T00:00:00.000Z');
    const cookie = await loginOwner(app, 'exp_owner');

    setNow('2026-01-03T00:00:00.000Z'); // past the 1440-minute (1 day) expiry
    const res = await request(app).get('/api/session/owner').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(
      setCookie.some(
        (c) => c.startsWith('vw_owner_session=;') || c.includes('Expires=Thu, 01 Jan 1970'),
      ),
    ).toBe(true);
  });

  it('rejects a session already marked terminated in the Sheet immediately, ignoring the 60s read cache', async () => {
    const { app, gateway } = makeApp();
    const cookie = await loginOwner(app, 'term_owner');
    const sessionId = cookie.split('=')[1]!;

    // Prime the 60s cache with an "active" read, then terminate the row directly
    // (bypassing the app, the way a separate device's logout would).
    await gateway.getRawTab('06_SESSIONS');
    await gateway.updateByPrimaryKey('06_SESSIONS', sessionId, { status: 'terminated' });

    const res = await request(app).get('/api/session/owner').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_TERMINATED');
  });
});

describe('POST /api/session/owner/heartbeat', () => {
  it('updates last_seen_at without changing expires_at and without an Entry Log', async () => {
    const { app, gateway, setNow } = makeApp('2026-01-01T00:00:00.000Z');
    const cookie = await loginOwner(app, 'hb_owner');

    const beforeLogs = await readEntryLogs(gateway);

    setNow('2026-01-01T00:05:00.000Z');
    const res = await request(app).post('/api/session/owner/heartbeat').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.session.lastSeenAt).toBe('2026-01-01T00:05:00.000Z');
    expect(res.body.session.expiresAt).toBe('2026-01-02T00:00:00.000Z');

    const afterLogs = await readEntryLogs(gateway);
    expect(afterLogs.length).toBe(beforeLogs.length);
  });

  it('rejects heartbeat with no cookie', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/session/owner/heartbeat');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('a retry (two rapid heartbeats) is safe and idempotent in effect', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app, 'hb_retry');

    const [r1, r2] = await Promise.all([
      request(app).post('/api/session/owner/heartbeat').set('Cookie', cookie),
      request(app).post('/api/session/owner/heartbeat').set('Cookie', cookie),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});

describe('DELETE /api/session/owner (logout)', () => {
  it('terminates the session, logs session_end once, and clears only the owner cookie', async () => {
    const { app, gateway } = makeApp();
    const ownerCookie = await loginOwner(app, 'logout1');
    const adminCookie = await loginAdmin(app, 'logout1_admin');

    const res = await request(app)
      .delete('/api/session/owner')
      .set('Cookie', [ownerCookie, adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((c) => c.startsWith('vw_owner_session=') && c.includes('1970'))).toBe(
      true,
    );
    expect(setCookie.some((c) => c.startsWith('vw_admin_session='))).toBe(false);

    const logs = await readEntryLogs(gateway);
    const matches = logs.filter((r) => r.event_type === 'session_end');
    expect(matches).toHaveLength(1);

    // The admin session must remain usable — logging out owner does not affect it.
    const adminResume = await request(app).get('/api/session/admin').set('Cookie', adminCookie);
    expect(adminResume.status).toBe(200);
  });

  it('is idempotent: a second logout for the same (now cookie-less) session still returns ok:true', async () => {
    const { app, gateway } = makeApp();
    const cookie = await loginOwner(app, 'logout2');

    await request(app).delete('/api/session/owner').set('Cookie', cookie);
    const second = await request(app).delete('/api/session/owner'); // cookie already cleared client-side
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true });

    const logs = await readEntryLogs(gateway);
    expect(logs.filter((r) => r.event_type === 'session_end')).toHaveLength(1);
  });

  it('returns success even when no cookie was ever present, without revealing anything', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/session/owner');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('Admin session resume/heartbeat/logout', () => {
  it('resumes a valid admin session', async () => {
    const { app } = makeApp();
    const cookie = await loginAdmin(app);
    const res = await request(app).get('/api/session/admin').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ kind: 'admin', userId: 'admin_fixture' });
  });

  it('expires exactly at the 120-minute boundary', async () => {
    const { app, setNow } = makeApp('2026-01-01T00:00:00.000Z');
    const cookie = await loginAdmin(app, 'admin_exp');

    setNow('2026-01-01T02:00:00.000Z'); // exactly 120 minutes later
    const res = await request(app).get('/api/session/admin').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('logout terminates only the admin session, owner session remains active', async () => {
    const { app } = makeApp();
    const ownerCookie = await loginOwner(app, 'both1_owner');
    const adminCookie = await loginAdmin(app, 'both1_admin');

    await request(app).delete('/api/session/admin').set('Cookie', [ownerCookie, adminCookie]);

    const ownerResume = await request(app).get('/api/session/owner').set('Cookie', ownerCookie);
    expect(ownerResume.status).toBe(200);
  });
});

describe('Admin authorization middleware on /api/admin/schema-health', () => {
  it('rejects with 401 when no admin cookie is present', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/admin/schema-health');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('rejects an owner session presented via the admin cookie with 403, not 200', async () => {
    const { app } = makeApp();
    const ownerCookieHeader = await loginOwner(app);
    const ownerSessionId = ownerCookieHeader.split('=')[1]!;

    const res = await request(app)
      .get('/api/admin/schema-health')
      .set('Cookie', `vw_admin_session=${ownerSessionId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });

  it('allows access with a valid admin session', async () => {
    const { app } = makeApp();
    const cookie = await loginAdmin(app);
    const res = await request(app).get('/api/admin/schema-health').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.summary.expectedTabCount).toBe(42);
  });

  it('never exposes session row or Admin user data in a rejection', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/admin/schema-health');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
    expect(serialized).not.toContain('admin_fixture');
  });
});
