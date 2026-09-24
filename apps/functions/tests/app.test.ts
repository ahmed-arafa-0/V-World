import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  GOOD_WORKBOOK,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
  buildM02Workbook,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function appWithFakeGateway() {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  return createApp({ getGateway: () => gateway });
}

function appWithoutGateway() {
  return createApp({ getGateway: () => null });
}

async function adminCookieFor(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_app_test',
    attemptId: 'app_test_admin_login',
  });
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return setCookie.find((c) => c.startsWith('vw_admin_session='))!.split(';')[0]!;
}

describe('GET /api/health', () => {
  it('returns 200 with the structured health payload when the backend is configured', async () => {
    const response = await request(appWithFakeGateway()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('veoullas-world-functions');
    expect(response.body.milestone).toBe('M01');
    expect(typeof response.body.timestamp).toBe('string');
    expect(response.body.sheets.reachable).toBe(true);
  });

  it('keeps working with a controlled status when the backend is not configured', async () => {
    const response = await request(appWithoutGateway()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.sheets.reachable).toBe(false);
    expect(response.body.schemaHealth.status).toBe('error');
  });
});

describe('GET /api/bootstrap', () => {
  it('returns a sanitized bootstrap payload with the expected exact counts', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap');

    expect(response.status).toBe(200);
    expect(response.body.languages).toHaveLength(5);
    expect(response.body.locations).toHaveLength(8);
    expect(response.body.storyBeats).toHaveLength(18);
    expect(response.body.currentEvent?.eventId).toBe('birthday_2026');
  });

  it('supports a read-only refresh bypass', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap?refresh=1');
    expect(response.status).toBe(200);
  });

  it('returns backend_not_configured when the Sheets backend is unavailable', async () => {
    const response = await request(appWithoutGateway()).get('/api/bootstrap');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: 'backend_not_configured',
      message: 'Google Sheets backend is not configured.',
    });
  });

  it('never sends a Google credential, Drive file ID, or plaintext secret over the network', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('fake_drive_id');
    expect(serialized).not.toContain('gserviceaccount.com');
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
  });
});

describe('GET /api/admin/schema-health', () => {
  it('rejects an unauthenticated request (protected by the M02 Admin middleware)', async () => {
    const response = await request(appWithFakeGateway()).get('/api/admin/schema-health');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SESSION_REQUIRED');
  });

  it('returns sanitized structural diagnostics only, for an authenticated Admin', async () => {
    const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
    const gateway = new SheetGateway(client, { ttlSeconds: 60 });
    const app = createApp({ getGateway: () => gateway });
    const cookie = await adminCookieFor(app);

    const response = await request(app).get('/api/admin/schema-health').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.summary.expectedTabCount).toBe(44);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
  });
});

describe('GET /api/admin/dashboard, /api/admin/logs, /api/admin/players/:userId', () => {
  it('reject an unauthenticated request', async () => {
    const app = appWithFakeGateway();
    for (const path of ['/api/admin/dashboard', '/api/admin/logs', '/api/admin/players/veoulla']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('SESSION_REQUIRED');
    }
  });

  it('reject an owner session presented via the Admin cookie', async () => {
    const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
    const gateway = new SheetGateway(client, { ttlSeconds: 60 });
    const app = createApp({ getGateway: () => gateway });
    const gateRes = await request(app)
      .post('/api/auth/gate')
      .send({
        digits: M02_FAKE_GATE_CODE.split(''),
        deviceId: 'device_app_test',
        attemptId: 'app_test_owner_login',
      });
    const setCookie = gateRes.headers['set-cookie'] as unknown as string[];
    const ownerCookie = setCookie.find((c) => c.startsWith('vw_owner_session='))!.split(';')[0]!;
    const sessionId = ownerCookie.split('=')[1]!;

    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Cookie', `vw_admin_session=${sessionId}`);
    expect([401, 403]).toContain(response.status);
  });

  it('return dashboard/log/player data for an authenticated Admin, and never leak the Admin password', async () => {
    const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
    const gateway = new SheetGateway(client, { ttlSeconds: 60 });
    const app = createApp({ getGateway: () => gateway });
    const cookie = await adminCookieFor(app);

    const dashboard = await request(app).get('/api/admin/dashboard').set('Cookie', cookie);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.ok).toBe(true);
    expect(typeof dashboard.body.serverTime).toBe('string');

    const logs = await request(app).get('/api/admin/logs').set('Cookie', cookie);
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body.rows)).toBe(true);

    const player = await request(app).get('/api/admin/players/veoulla').set('Cookie', cookie);
    expect(player.status).toBe(200);
    expect(player.body.userId).toBe('veoulla');

    const serialized =
      JSON.stringify(dashboard.body) + JSON.stringify(logs.body) + JSON.stringify(player.body);
    expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
  });
});

describe('unknown route', () => {
  it('returns a structured 404 ApiError rather than a raw framework error', async () => {
    const response = await request(appWithFakeGateway()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      code: 'not_found',
      message: 'No route for GET /api/does-not-exist',
    });
  });
});
