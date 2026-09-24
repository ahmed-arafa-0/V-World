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
    .send({ digits: CORRECT_DIGITS, deviceId: 'device_content_runtime', attemptId: 'cr_owner' });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(app: import('express').Express): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_content_runtime',
    attemptId: 'cr_admin',
  });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

describe('GET /api/content/runtime — owner authorization', () => {
  it('rejects with 401 SESSION_REQUIRED when no owner cookie is present', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/content/runtime');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('rejects an Admin session presented via the owner cookie with 403, not 200 — Admin auth never counts as owner auth', async () => {
    const { app } = makeApp();
    const adminCookieHeader = await loginAdmin(app);
    const adminSessionId = adminCookieHeader.split('=')[1]!;

    const res = await request(app)
      .get('/api/content/runtime')
      .set('Cookie', `vw_owner_session=${adminSessionId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });

  it('allows access with a valid owner session and returns the expected payload shape', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const res = await request(app).get('/api/content/runtime').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.languages)).toBe(true);
    expect(res.body.languages).toHaveLength(5);
    expect(Array.isArray(res.body.uiText)).toBe(true);
    expect(Array.isArray(res.body.dialogue)).toBe(true);
    expect(Array.isArray(res.body.icons)).toBe(true);
    expect(Array.isArray(res.body.assets)).toBe(true);
    expect(Array.isArray(res.body.diagnostics)).toBe(true);
  });

  it('never includes a voiceover field — narration/dialogue is text-only (Ahmed 2026-09-17)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const res = await request(app).get('/api/content/runtime').set('Cookie', cookie);
    expect(res.body).not.toHaveProperty('voiceover');
    expect(JSON.stringify(res.body)).not.toContain('voiceoverMediaRef');
  });

  it('never exposes a raw Drive file ID, session row, or credential in the response', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const res = await request(app).get('/api/content/runtime').set('Cookie', cookie);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('fake_drive_id');
    expect(serialized).not.toMatch(/DRIVE_FILE_ID/);
    expect(serialized).not.toContain(M02_FAKE_GATE_CODE);
    expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
    expect(serialized).not.toMatch(/"sessionId"/);
    expect(serialized).not.toContain('gate_code_plaintext');
    expect(serialized).not.toContain('admin_password_plaintext');
  });

  it('supports ?refresh=1 to bypass the read cache', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const res = await request(app).get('/api/content/runtime?refresh=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
