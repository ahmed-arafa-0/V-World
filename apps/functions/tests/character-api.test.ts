import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildM02Workbook, M02_FAKE_GATE_CODE } from '@veoullas-world/test-fixtures';
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
    .send({ digits: CORRECT_DIGITS, deviceId: 'device_character_api', attemptId: 'char_owner' });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

describe('Character API — owner authorization', () => {
  it('GET /api/character/state requires a valid owner session', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/character/state?characterId=var');
    expect(res.status).toBe(401);
  });

  it('POST /api/character/name requires a valid owner session', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/character/name')
      .send({ characterId: 'var', personalName: 'Luna', selectedGender: 'female' });
    expect(res.status).toBe(401);
  });
});

describe('Character API — naming flow', () => {
  it('returns null before any name is set', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/character/state?characterId=var')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.character).toBeNull();
  });

  it('sets the name/gender and reads it back', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    const nameRes = await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: 'Luna', selectedGender: 'female' });
    expect(nameRes.status).toBe(200);
    expect(nameRes.body.character.personalName).toBe('Luna');

    const stateRes = await request(app)
      .get('/api/character/state?characterId=var')
      .set('Cookie', cookie);
    expect(stateRes.body.character.personalName).toBe('Luna');
    expect(stateRes.body.character.selectedGender).toBe('female');
  });

  it('allows changing the name later (renaming is always permitted)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);

    await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: 'Luna', selectedGender: 'female' });
    const renamed = await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: 'Star', selectedGender: 'female' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.character.personalName).toBe('Star');
  });

  it('rejects a blank personal name', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: '   ', selectedGender: 'female' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown extra field (e.g. a client-supplied userId)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).post('/api/character/name').set('Cookie', cookie).send({
      characterId: 'var',
      personalName: 'Luna',
      selectedGender: 'female',
      userId: 'someone_else',
    });
    expect(res.status).toBe(400);
  });

  it('never exposes the internal system_name ("VAR") in any response', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: 'Luna', selectedGender: 'female' });
    expect(JSON.stringify(res.body)).not.toMatch(/"VAR"/);
  });
});

describe('Character API — canonical gender', () => {
  it('rejects free-text or non-canonical gender values and stores nothing', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    for (const selectedGender of ['nonbinary', 'Female', 'other', '']) {
      const res = await request(app)
        .post('/api/character/name')
        .set('Cookie', cookie)
        .send({ characterId: 'var', personalName: 'Luna', selectedGender });
      expect(res.status, selectedGender).toBe(400);
    }
    const state = await request(app)
      .get('/api/character/state?characterId=var')
      .set('Cookie', cookie);
    expect(state.body.character ?? null).toBeNull();
  });

  it('accepts male and female, and reads back an older free-text value untouched', async () => {
    const { app, gateway } = makeApp();
    const cookie = await loginOwner(app);
    await gateway.appendRow('37_CHARACTER_STATE', {
      user_character_key: 'owner_fixture|var',
      user_id: 'owner_fixture',
      character_id: 'var',
      personal_name: 'Old',
      selected_gender: 'verification',
    });
    const legacy = await request(app)
      .get('/api/character/state?characterId=var')
      .set('Cookie', cookie);
    expect(legacy.body.character.selectedGender).toBe('verification');
    const ok = await request(app)
      .post('/api/character/name')
      .set('Cookie', cookie)
      .send({ characterId: 'var', personalName: 'Luna', selectedGender: 'male' });
    expect(ok.status).toBe(200);
    expect(ok.body.character.selectedGender).toBe('male');
  });
});
