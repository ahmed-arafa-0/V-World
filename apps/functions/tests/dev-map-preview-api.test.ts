import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { BackendEnvironment } from '@veoullas-world/contracts';
import {
  buildM02Workbook,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { seedPhase1MapAssets } from '../src/services/phase1-map-assets-seed.service.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');
const ROUTE = '/api/dev/map-preview-assets';

function makeApp(environment: BackendEnvironment) {
  const client = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  const app = createApp({
    getGateway: () => gateway,
    now: () => new Date(),
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
    .send({ digits: CORRECT_DIGITS, deviceId: 'device_dev_map_preview', attemptId: 'dmp_owner' });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(app: import('express').Express): Promise<string> {
  const res = await request(app).post('/api/auth/admin').send({
    username: 'admin_fixture',
    password: M02_FAKE_ADMIN_PASSWORD,
    deviceId: 'device_dev_map_preview',
    attemptId: 'dmp_admin',
  });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

describe('GET /api/dev/map-preview-assets — development-only environment boundary', () => {
  it('404s in production for an unauthenticated request — indistinguishable from an unknown route', async () => {
    const { app } = makeApp('production');
    const res = await request(app).get(ROUTE);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(res.body.message).toBe(`No route for GET ${ROUTE}`);
  });

  it('404s in production even with a valid owner session — the environment check runs before auth', async () => {
    const { app, gateway } = makeApp('production');
    await seedPhase1MapAssets(gateway);
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('404s in staging — staging is not treated as a development environment', async () => {
    const { app, gateway } = makeApp('staging');
    await seedPhase1MapAssets(gateway);
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('the exact 404 body matches the app-wide catch-all shape, so this route cannot be fingerprinted from a non-development environment', async () => {
    const { app: devApp } = makeApp('local');
    const { app: prodApp } = makeApp('production');

    const unknownRouteRes = await request(devApp).get('/api/this-route-does-not-exist');
    const prodDevRouteRes = await request(prodApp).get(ROUTE);

    expect(prodDevRouteRes.status).toBe(unknownRouteRes.status);
    expect(prodDevRouteRes.body.code).toBe(unknownRouteRes.body.code);
  });
});

describe('GET /api/dev/map-preview-assets — owner authorization still applies in development', () => {
  it('rejects with 401 SESSION_REQUIRED when no owner cookie is present, in local', async () => {
    const { app } = makeApp('local');
    const res = await request(app).get(ROUTE);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('rejects with 401 SESSION_REQUIRED when no owner cookie is present, in the emulator', async () => {
    const { app } = makeApp('emulator');
    const res = await request(app).get(ROUTE);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('rejects an Admin session presented via the owner cookie with 403, not 200, in local', async () => {
    const { app } = makeApp('local');
    const adminCookieHeader = await loginAdmin(app);
    const adminSessionId = adminCookieHeader.split('=')[1]!;

    const res = await request(app).get(ROUTE).set('Cookie', `vw_owner_session=${adminSessionId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });
});

describe('GET /api/dev/map-preview-assets — payload, in local/emulator with a valid owner session', () => {
  it('returns both map assets with correct mediaRef/hasPosterVariant once seeded, in local', async () => {
    const { app, gateway } = makeApp('local');
    await seedPhase1MapAssets(gateway);
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.assets).toHaveLength(2);

    const island = res.body.assets.find(
      (a: { assetId: string }) => a.assetId === 'map_island_transparent',
    );
    const ocean = res.body.assets.find((a: { assetId: string }) => a.assetId === 'map_ocean_loop');
    expect(island.mediaRef).toBe('/api/media/map_island_transparent?v=1');
    expect(island.hasPosterVariant).toBe(false);
    expect(ocean.mediaRef).toBe('/api/media/map_ocean_loop?v=1');
    expect(ocean.hasPosterVariant).toBe(true);
  });

  it('also works in the emulator environment', async () => {
    const { app, gateway } = makeApp('emulator');
    await seedPhase1MapAssets(gateway);
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(2);
  });

  it('returns an empty (not an error) assets array when neither asset is seeded yet', async () => {
    const { app } = makeApp('local');
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.assets).toEqual([]);
  });

  it('omits a disabled map asset rather than erroring', async () => {
    const { app, gateway } = makeApp('local');
    await seedPhase1MapAssets(gateway);
    await gateway.updateByPrimaryKey('10_ASSETS', 'map_island_transparent', { enabled: 'FALSE' });
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.assets[0].assetId).toBe('map_ocean_loop');
  });

  it('never exposes a raw Drive file ID anywhere in the response', async () => {
    const { app, gateway } = makeApp('local');
    await seedPhase1MapAssets(gateway);
    const cookie = await loginOwner(app);

    const res = await request(app).get(ROUTE).set('Cookie', cookie);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8');
    expect(serialized).not.toContain('1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo');
    expect(serialized).not.toContain('1de1aBHsIG3PEso7WMALHKIaAVPNberMt');
  });
});
