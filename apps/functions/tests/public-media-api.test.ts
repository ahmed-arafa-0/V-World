import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  buildM02Workbook,
  headerFor,
  M02_FAKE_GATE_CODE,
  row,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { PUBLIC_ICON_ASSETS, PUBLIC_MEDIA_ASSET_IDS } from '../src/api/public-media.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';

const ROOT = 'fixture_drive_root_folder_id'; // matches GOOD_WORKBOOK/buildM02Workbook's 01_APP_CONFIG.drive_root_folder_id
const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

const GATE_BG_CONTENT = Buffer.from('gate-closed-bg-bytes');
const GATE_BG_MOBILE_CONTENT = Buffer.from('mobile');
const VAR_IDLE_CONTENT = Buffer.from('var-idle-no-collar-bytes');

function buildWorkbook() {
  const workbook = buildM02Workbook();
  workbook['10_ASSETS'] = [
    headerFor('10_ASSETS'),
    row('10_ASSETS', {
      asset_id: 'gate_closed_bg',
      asset_type: 'image',
      drive_file_id: 'file_gate_bg',
      mobile_drive_file_id: 'file_gate_bg_mobile',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'var_idle_no_collar',
      asset_type: 'image',
      drive_file_id: 'file_var_idle',
      preload_priority: '2',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'gate_ajar_static_bg',
      asset_type: 'image',
      drive_file_id: 'file_gate_ajar',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'Registered and enabled, but deliberately NOT on the public allowlist.',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_icon_settings',
      asset_type: 'image',
      drive_file_id: 'file_icon_settings',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'gate_closed_bg_disabled_copy',
      asset_type: 'image',
      drive_file_id: 'file_gate_bg',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'FALSE',
      version: '1',
      notes: '',
    }),
  ];
  return workbook;
}

function buildDriveClient(): FakeGoogleDriveClient {
  return new FakeGoogleDriveClient({
    file_gate_bg: {
      metadata: fakeMetadata({
        id: 'file_gate_bg',
        mimeType: 'image/png',
        parents: [ROOT],
        size: GATE_BG_CONTENT.length,
      }),
      content: GATE_BG_CONTENT,
    },
    file_gate_bg_mobile: {
      metadata: fakeMetadata({
        id: 'file_gate_bg_mobile',
        mimeType: 'image/png',
        parents: [ROOT],
        size: GATE_BG_MOBILE_CONTENT.length,
      }),
      content: GATE_BG_MOBILE_CONTENT,
    },
    file_var_idle: {
      metadata: fakeMetadata({
        id: 'file_var_idle',
        mimeType: 'image/png',
        parents: [ROOT],
        size: VAR_IDLE_CONTENT.length,
      }),
      content: VAR_IDLE_CONTENT,
    },
    file_icon_settings: {
      metadata: fakeMetadata({
        id: 'file_icon_settings',
        mimeType: 'image/svg+xml',
        parents: [ROOT],
        size: 4,
      }),
      content: Buffer.from('<svg'),
    },
    file_gate_ajar: {
      metadata: fakeMetadata({
        id: 'file_gate_ajar',
        mimeType: 'image/png',
        parents: [ROOT],
        size: 5,
      }),
      content: Buffer.from('ajar!'),
    },
  });
}

function makeApp() {
  const gatewayClient = new FakeGoogleSheetsClient(structuredClone(buildWorkbook()));
  const gateway = new SheetGateway(gatewayClient, { ttlSeconds: 60 });
  const driveClient = buildDriveClient();
  const app = createApp({
    getGateway: () => gateway,
    getDriveClient: () => driveClient,
    now: () => new Date(),
    isProduction: () => false,
  });
  return app;
}

describe('PUBLIC_MEDIA_ASSET_IDS — the exact, deliberately narrow allowlist', () => {
  it('contains only gate_closed_bg and var_idle_no_collar', () => {
    expect(Array.from(PUBLIC_MEDIA_ASSET_IDS).sort()).toEqual([
      'gate_closed_bg',
      'var_idle_no_collar',
    ]);
  });
});

describe('PUBLIC_ICON_ASSETS: the pre-Gate settings icon only', () => {
  it('maps exactly icon_settings to asset_icon_settings', () => {
    expect(Array.from(PUBLIC_ICON_ASSETS.entries())).toEqual([
      ['icon_settings', 'asset_icon_settings'],
    ]);
  });
  it('serves asset_icon_settings publicly, and no other icon asset', async () => {
    const app = makeApp();
    const ok = await request(app).get('/api/public-media/asset_icon_settings?v=1');
    expect(ok.status).toBe(200);
    const other = await request(app).get('/api/public-media/asset_icon_walk_forward?v=1');
    expect(other.status).toBe(404);
    expect(other.body.message).toMatch(/^No route for GET/);
  });
});

describe('GET /api/public-media/:assetId — allowlisted assets, no session required', () => {
  it('serves gate_closed_bg with no cookie at all', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/public-media/gate_closed_bg?v=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GATE_BG_CONTENT);
  });

  it('serves var_idle_no_collar with no cookie at all', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/public-media/var_idle_no_collar?v=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(VAR_IDLE_CONTENT);
  });

  it('serves the mobile variant of an allowlisted asset via the existing variant query', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/public-media/gate_closed_bg?v=1&variant=mobile');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GATE_BG_MOBILE_CONTENT);
  });

  it('HEAD returns 200 with no body for an allowlisted asset', async () => {
    const app = makeApp();
    const res = await request(app).head('/api/public-media/gate_closed_bg?v=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('a real, enabled 10_ASSETS row NOT on the allowlist 404s exactly like an unknown route', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/public-media/gate_ajar_static_bg?v=1');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(res.body.message).toMatch(/^No route for GET/);
  });

  it('a completely unknown assetId 404s identically (allowlist membership is not distinguishable by probing)', async () => {
    const app = makeApp();
    const knownDenyRes = await request(app).get('/api/public-media/gate_ajar_static_bg?v=1');
    const unknownRes = await request(app).get('/api/public-media/totally_made_up_asset_id?v=1');
    expect(unknownRes.status).toBe(knownDenyRes.status);
    expect(unknownRes.body.code).toBe(knownDenyRes.body.code);
    expect(unknownRes.body.code).toBe('not_found');
  });

  it('an allowlisted but disabled asset 404s with the real MEDIA_ASSET_DISABLED code — the allowlist gate never masks that distinction', async () => {
    const workbook = buildWorkbook();
    const disabledRow = workbook['10_ASSETS']!.find(
      (r) => r[headerFor('10_ASSETS').indexOf('asset_id')] === 'gate_closed_bg',
    )!;
    disabledRow[headerFor('10_ASSETS').indexOf('enabled')] = 'FALSE';
    const gatewayClient = new FakeGoogleSheetsClient(structuredClone(workbook));
    const gateway = new SheetGateway(gatewayClient, { ttlSeconds: 60 });
    const app = createApp({
      getGateway: () => gateway,
      getDriveClient: () => buildDriveClient(),
      now: () => new Date(),
      isProduction: () => false,
    });

    const res = await request(app).get('/api/public-media/gate_closed_bg?v=1');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEDIA_ASSET_DISABLED');
  });

  it('never leaks a raw Drive file ID in headers or body', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/public-media/gate_closed_bg?v=1');
    const serialized = JSON.stringify(res.headers);
    expect(serialized).not.toContain('file_gate_bg');
  });
});

describe('The owner-session-protected /api/media/:assetId route is unaffected', () => {
  it('still requires a real owner session for the exact same asset id the public route also serves', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/media/gate_closed_bg?v=1');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('still serves any registered asset (not just the public allowlist) once authenticated', async () => {
    const app = makeApp();
    const loginRes = await request(app)
      .post('/api/auth/gate')
      .send({
        digits: CORRECT_DIGITS,
        deviceId: 'device_public_media_test',
        attemptId: `public_media_owner_${Math.random()}`,
      });
    const setCookie = loginRes.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('vw_owner_session='))!.split(';')[0]!;

    const res = await request(app).get('/api/media/gate_ajar_static_bg?v=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
