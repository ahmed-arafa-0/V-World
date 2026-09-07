import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { PassThrough, Readable } from 'node:stream';
import {
  buildM02Workbook,
  headerFor,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
  row,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { createMediaHandler } from '../src/api/media.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';

const ROOT = 'fixture_drive_root_folder_id'; // matches GOOD_WORKBOOK's 01_APP_CONFIG.drive_root_folder_id
const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

const IMAGE_CONTENT = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
const VIDEO_CONTENT = Buffer.from('x'.repeat(500));

function buildWorkbook() {
  const workbook = buildM02Workbook();
  workbook['10_ASSETS'] = [
    headerFor('10_ASSETS'),
    row('10_ASSETS', {
      asset_id: 'asset_image',
      asset_type: 'image',
      drive_file_id: 'file_image',
      mobile_drive_file_id: 'file_image_mobile',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_video',
      asset_type: 'video',
      drive_file_id: 'file_video',
      poster_drive_file_id: 'file_video_poster',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '2',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_disabled',
      asset_type: 'image',
      drive_file_id: 'file_disabled',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'FALSE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_outside_root',
      asset_type: 'image',
      drive_file_id: 'file_outside_root',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_shortcut',
      asset_type: 'image',
      drive_file_id: 'file_shortcut',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_mime_mismatch',
      asset_type: 'audio',
      drive_file_id: 'file_mime_mismatch',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_forbidden_mime',
      asset_type: 'image',
      drive_file_id: 'file_forbidden_mime',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_transient',
      asset_type: 'image',
      drive_file_id: 'file_transient',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_permanent_fail',
      asset_type: 'image',
      drive_file_id: 'file_permanent_fail',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: '',
    }),
  ];
  return workbook;
}

function buildDriveClient(): FakeGoogleDriveClient {
  return new FakeGoogleDriveClient({
    file_image: {
      metadata: fakeMetadata({
        id: 'file_image',
        mimeType: 'image/png',
        parents: [ROOT],
        size: IMAGE_CONTENT.length,
      }),
      content: IMAGE_CONTENT,
    },
    file_image_mobile: {
      metadata: fakeMetadata({
        id: 'file_image_mobile',
        mimeType: 'image/webp',
        parents: [ROOT],
        size: 10,
      }),
      content: Buffer.from('mobile1234'),
    },
    file_video: {
      metadata: fakeMetadata({
        id: 'file_video',
        mimeType: 'video/mp4',
        parents: [ROOT],
        size: VIDEO_CONTENT.length,
      }),
      content: VIDEO_CONTENT,
    },
    file_video_poster: {
      metadata: fakeMetadata({
        id: 'file_video_poster',
        mimeType: 'image/jpeg',
        parents: [ROOT],
        size: 5,
      }),
      content: Buffer.from('poste'),
    },
    some_other_folder: {
      metadata: fakeMetadata({ id: 'some_other_folder', parents: [] }),
      content: Buffer.alloc(0),
    },
    file_outside_root: {
      metadata: fakeMetadata({
        id: 'file_outside_root',
        mimeType: 'image/png',
        parents: ['some_other_folder'],
        size: 10,
      }),
      content: Buffer.from('0123456789'),
    },
    file_shortcut: {
      metadata: fakeMetadata({
        id: 'file_shortcut',
        mimeType: 'application/vnd.google-apps.shortcut',
        parents: [ROOT],
        size: null,
        shortcutTargetId: 'some_target_id',
        shortcutTargetMimeType: 'image/png',
      }),
      content: Buffer.alloc(0),
    },
    file_mime_mismatch: {
      metadata: fakeMetadata({
        id: 'file_mime_mismatch',
        mimeType: 'image/png',
        parents: [ROOT],
        size: 10,
      }),
      content: Buffer.from('0123456789'),
    },
    file_forbidden_mime: {
      metadata: fakeMetadata({
        id: 'file_forbidden_mime',
        mimeType: 'text/html',
        parents: [ROOT],
        size: 10,
      }),
      content: Buffer.from('<html></html>'),
    },
    file_transient: {
      metadata: fakeMetadata({
        id: 'file_transient',
        mimeType: 'image/png',
        parents: [ROOT],
        size: 2,
      }),
      content: Buffer.from('ok'),
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
  return { app, gateway, driveClient };
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
      digits: CORRECT_DIGITS,
      deviceId: 'device_media',
      attemptId: `media_owner_${Math.random()}`,
    });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_owner_session');
}

async function loginAdmin(app: import('express').Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/admin')
    .send({
      username: 'admin_fixture',
      password: M02_FAKE_ADMIN_PASSWORD,
      deviceId: 'device_media',
      attemptId: `media_admin_${Math.random()}`,
    });
  return cookieHeaderFrom(res.headers['set-cookie'] as unknown as string[], 'vw_admin_session');
}

describe('Media gateway — owner authorization', () => {
  it('rejects with 401 SESSION_REQUIRED when no owner cookie is present', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/media/asset_image?v=1');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('rejects an Admin session presented via the owner cookie with 403 — Admin auth never counts as owner auth', async () => {
    const { app } = makeApp();
    const adminCookieHeader = await loginAdmin(app);
    const adminSessionId = adminCookieHeader.split('=')[1]!;
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', `vw_owner_session=${adminSessionId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_FORBIDDEN');
  });

  it('allows access with a valid owner session', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_image?v=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

describe('Media gateway — GET/HEAD full response', () => {
  it('GET without Range streams the full file with matching Content-Length', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe(String(IMAGE_CONTENT.length));
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect((res.body as Buffer).equals(IMAGE_CONTENT)).toBe(true);
  });

  it('HEAD returns the same headers with no body and never requests a content stream', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    const before = driveClient.contentCallCount;
    const res = await request(app).head('/api/media/asset_image?v=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe(String(IMAGE_CONTENT.length));
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.text ?? '').toBe('');
    expect(driveClient.contentCallCount).toBe(before);
  });
});

describe('Media gateway — byte ranges', () => {
  it('supports "bytes=start-end"', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=0-99')
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${IMAGE_CONTENT.length}`);
    expect(res.headers['content-length']).toBe('100');
    expect((res.body as Buffer).equals(IMAGE_CONTENT.subarray(0, 100))).toBe(true);
  });

  it('supports open-ended "bytes=start-"', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=900-')
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 900-999/${IMAGE_CONTENT.length}`);
    expect((res.body as Buffer).equals(IMAGE_CONTENT.subarray(900))).toBe(true);
  });

  it('supports suffix "bytes=-N"', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=-100')
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 900-999/${IMAGE_CONTENT.length}`);
    expect((res.body as Buffer).equals(IMAGE_CONTENT.subarray(900))).toBe(true);
  });

  it('returns 416 with Content-Range: bytes */total for an unsatisfiable range', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=5000-6000');
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${IMAGE_CONTENT.length}`);
  });

  it('rejects a malformed Range with a safe 400', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'not-a-range');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_RANGE_MALFORMED');
  });

  it('rejects a multi-range request with a safe 400', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=0-10,20-30');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_RANGE_MALFORMED');
  });

  it('forwards only the validated range to Drive, not the raw client header', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    await request(app)
      .get('/api/media/asset_image?v=1')
      .set('Cookie', cookie)
      .set('Range', 'bytes=10-2000000') // wildly out-of-bounds end, must be clamped
      .buffer(true)
      .parse((response, cb) => {
        response.on('data', () => {});
        response.on('end', () => cb(null, null));
      });
    expect(driveClient.lastRequestedRange).toEqual({ start: 10, end: IMAGE_CONTENT.length - 1 });
  });
});

describe('Media gateway — variant selection', () => {
  it('mobile variant serves the configured mobile file', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1&variant=mobile')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
  });

  it('mobile variant falls back to the default file when no mobile file is configured', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_video?v=2&variant=mobile')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
  });

  it('poster variant serves the configured poster file (an image, even for a video asset)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_video?v=2&variant=poster')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });

  it('returns a safe missing-variant result when no poster is configured', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1&variant=poster')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEDIA_VARIANT_NOT_FOUND');
  });

  it('rejects an unrecognized variant', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app)
      .get('/api/media/asset_image?v=1&variant=thumbnail')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_ASSET_INVALID');
  });
});

describe('Media gateway — disabled/missing/version', () => {
  it('rejects a disabled asset without ever calling Drive', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    const before = driveClient.metadataCallCount;
    const res = await request(app).get('/api/media/asset_disabled?v=1').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEDIA_ASSET_DISABLED');
    expect(driveClient.metadataCallCount).toBe(before);
  });

  it('rejects a missing asset without ever calling Drive', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    const before = driveClient.metadataCallCount;
    const res = await request(app).get('/api/media/asset_does_not_exist?v=1').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEDIA_ASSET_NOT_FOUND');
    expect(driveClient.metadataCallCount).toBe(before);
  });

  it('rejects an invalid asset ID as a 400', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/not valid!?v=1').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_ASSET_INVALID');
  });

  it('rejects a version mismatch with 409, without ever calling Drive', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    const before = driveClient.metadataCallCount;
    const res = await request(app).get('/api/media/asset_image?v=99').set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MEDIA_VERSION_MISMATCH');
    expect(driveClient.metadataCallCount).toBe(before);
  });
});

describe('Media gateway — Drive containment, shortcuts, and MIME safety', () => {
  it('rejects a file outside the configured root with 403', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_outside_root?v=1').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEDIA_FILE_OUTSIDE_ROOT');
  });

  it('rejects a Drive shortcut with a safe, documented error', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_shortcut?v=1').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEDIA_SHORTCUT_REJECTED');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('some_target_id');
  });

  it('rejects a Sheet/Drive asset-type MIME mismatch (audio asset resolving to an image file)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_mime_mismatch?v=1').set('Cookie', cookie);
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('MEDIA_UNSUPPORTED_MIME');
  });

  it('rejects an outright forbidden MIME type (text/html)', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_forbidden_mime?v=1').set('Cookie', cookie);
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('MEDIA_UNSUPPORTED_MIME');
  });
});

describe('Media gateway — transient vs. permanent Drive failures', () => {
  it('retries a transient (503) metadata failure and still succeeds', async () => {
    const { app, driveClient } = makeApp();
    driveClient.planFailures('file_transient', 503, 1);
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_transient?v=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(driveClient.metadataCallCount).toBe(2);
  });

  it('does not retry a permanent (missing file) failure', async () => {
    const { app, driveClient } = makeApp();
    const cookie = await loginOwner(app);
    const res = await request(app).get('/api/media/asset_permanent_fail?v=1').set('Cookie', cookie);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('MEDIA_FILE_INACCESSIBLE');
    expect(driveClient.metadataCallCount).toBe(1);
  });
});

describe('Media gateway — no leakage of Drive IDs, tokens, or credentials', () => {
  it('no error or success response ever contains a raw Drive file ID, credential, or session ID', async () => {
    const { app } = makeApp();
    const cookie = await loginOwner(app);
    const responses = await Promise.all([
      request(app).get('/api/media/asset_outside_root?v=1').set('Cookie', cookie),
      request(app).get('/api/media/asset_shortcut?v=1').set('Cookie', cookie),
      request(app).get('/api/media/asset_mime_mismatch?v=1').set('Cookie', cookie),
      request(app).get('/api/media/asset_permanent_fail?v=1').set('Cookie', cookie),
      request(app).get('/api/media/asset_disabled?v=1').set('Cookie', cookie),
      request(app).get('/api/media/asset_image?v=1').set('Cookie', cookie), // success
    ]);
    for (const res of responses) {
      const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
      expect(serialized).not.toMatch(/file_[a-z_]+/); // no fake "file_*" Drive IDs anywhere
      expect(serialized).not.toContain(M02_FAKE_GATE_CODE);
      expect(serialized).not.toContain(M02_FAKE_ADMIN_PASSWORD);
      expect(serialized).not.toMatch(/"sessionId"/);
      expect(serialized).not.toMatch(/private_key|client_email|BEGIN PRIVATE KEY|Authorization/i);
    }
  });
});

describe('Media gateway — streaming behavior (direct handler, no HTTP socket)', () => {
  function makeFakeRes() {
    const res = new PassThrough() as unknown as PassThrough & {
      headersSent: boolean;
      statusCode: number;
      set: (headers: Record<string, string>) => void;
      status: (code: number) => typeof res;
      json: (body: unknown) => void;
      _jsonBody?: unknown;
    };
    res.headersSent = false;
    res.statusCode = 200;
    res.set = (headers: Record<string, string>) => {
      void headers;
    };
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body: unknown) => {
      res.headersSent = true;
      res._jsonBody = body;
      res.end();
    };
    const originalWrite = res.write.bind(res);
    res.write = ((...args: Parameters<typeof originalWrite>) => {
      res.headersSent = true;
      return originalWrite(...args);
    }) as typeof res.write;
    return res;
  }

  function makeFakeReq(
    overrides: Partial<{
      method: string;
      params: Record<string, string>;
      query: Record<string, string>;
      headers: Record<string, string>;
    }>,
  ) {
    const emitter = new PassThrough();
    return Object.assign(emitter, {
      method: 'GET',
      params: {},
      query: {},
      headers: {},
      ...overrides,
    });
  }

  it('does not buffer the full file before responding — the handler resolves while the stream is still draining', async () => {
    const gatewayClient = new FakeGoogleSheetsClient(structuredClone(buildWorkbook()));
    const gateway = new SheetGateway(gatewayClient, { ttlSeconds: 60 });
    const driveClient = buildDriveClient();

    let pushCount = 0;
    driveClient.setCustomStream('file_image', () => {
      const slow = new Readable({
        read() {
          pushCount++;
          if (pushCount > 5) {
            this.push(null);
            return;
          }
          setTimeout(() => this.push(Buffer.from('chunk')), 10);
        },
      });
      return slow;
    });

    const handler = createMediaHandler(
      () => gateway,
      () => driveClient,
    );
    const req = makeFakeReq({
      method: 'GET',
      params: { assetId: 'asset_image' },
      query: { v: '1' },
    });
    const res = makeFakeRes();

    const handlerStart = Date.now();
    await handler(req as never, res as never);
    const handlerDuration = Date.now() - handlerStart;

    // The handler call itself must return almost immediately after wiring
    // up the pipe — it must not await the ~50ms+ it takes the slow stream
    // to finish emitting all its chunks, proving no full-file buffering.
    expect(handlerDuration).toBeLessThan(40);
    expect(pushCount).toBeLessThanOrEqual(2);
  });

  it('aborts the upstream Drive stream when the client disconnects', async () => {
    const gatewayClient = new FakeGoogleSheetsClient(structuredClone(buildWorkbook()));
    const gateway = new SheetGateway(gatewayClient, { ttlSeconds: 60 });
    const driveClient = buildDriveClient();

    let destroyed = false;
    driveClient.setCustomStream('file_image', () => {
      const neverEnding = new Readable({
        read() {
          setTimeout(() => this.push(Buffer.from('x')), 5);
        },
        destroy(err, callback) {
          destroyed = true;
          callback(err);
        },
      });
      return neverEnding;
    });

    const handler = createMediaHandler(
      () => gateway,
      () => driveClient,
    );
    const req = makeFakeReq({
      method: 'GET',
      params: { assetId: 'asset_image' },
      query: { v: '1' },
    });
    const res = makeFakeRes();

    await handler(req as never, res as never);
    req.emit('close');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(destroyed).toBe(true);
  });

  it('destroys the response (never a JSON body) when the Drive stream errors mid-transfer', async () => {
    const gatewayClient = new FakeGoogleSheetsClient(structuredClone(buildWorkbook()));
    const gateway = new SheetGateway(gatewayClient, { ttlSeconds: 60 });
    const driveClient = buildDriveClient();

    driveClient.setCustomStream('file_image', () => {
      const failing = new Readable({
        read() {
          this.push(Buffer.from('partial-data'));
          setTimeout(() => this.destroy(new Error('simulated mid-stream failure')), 5);
        },
      });
      return failing;
    });

    const handler = createMediaHandler(
      () => gateway,
      () => driveClient,
    );
    const req = makeFakeReq({
      method: 'GET',
      params: { assetId: 'asset_image' },
      query: { v: '1' },
    });
    const res = makeFakeRes();

    await handler(req as never, res as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Some bytes were already flushed, so the failure must never be
    // reported as a clean JSON error body on this same response.
    expect(res._jsonBody).toBeUndefined();
    expect(res.destroyed).toBe(true);
  });
});
