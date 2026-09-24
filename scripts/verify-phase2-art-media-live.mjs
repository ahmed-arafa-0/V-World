#!/usr/bin/env node
/**
 * LIVE check of the registered Phase 2 art through the real media gateway (real Sheet + Drive,
 * read-only): every registered asset (desktop and mobile variant) is fetched at its Sheet
 * version via /api/media, must be 200 image/png, and must be byte-identical (sha256) to the
 * local upload-ready file. Uses one isolated generated session; no player row of the owner is touched.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';
import {
  PHASE2_ASSET_SPECS,
  PHASE2_ICON_SPECS,
} from '../apps/functions/lib/services/phase2-art-assets-seed.service.js';

const gateway = getProductionGatewayOrNull();
if (!gateway) {
  console.error('BLOCKER: no credential');
  process.exit(1);
}
const app = express();
app.use(createApp());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const userId = `art_media_check_${Date.now()}`;
const sessionId = buildSessionId('gate', userId);
const now = new Date();
await createOrReconcileSession(gateway, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: 'art-media-check',
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600_000),
});

const assets = new Map(
  (await gateway.readTab('10_ASSETS', { bypass: true })).rows.map((r) => [r.raw.asset_id, r.raw]),
);
const dir = 'assets/veoulla-art-upload-ready/';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const jobs = [];
for (const s of PHASE2_ASSET_SPECS) {
  jobs.push([s.assetId, 'default', s.file]);
  if (s.mobileFile) jobs.push([s.assetId, 'mobile', s.mobileFile]);
}
for (const s of PHASE2_ICON_SPECS) jobs.push([s.assetId, 'default', s.file]);
let ok = 0;
const fails = [];
for (const [id, variant, file] of jobs) {
  const row = assets.get(id);
  const url = `${origin}/api/media/${id}?variant=${variant}&v=${row?.version}`;
  try {
    const res = await fetch(url, { headers: { cookie: `vw_owner_session=${sessionId}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    const same = sha(buf) === sha(fs.readFileSync(dir + file));
    const good =
      res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('image/png') && same;
    if (good) ok++;
    else
      fails.push(
        `${id}/${variant}: ${res.status} ${res.headers.get('content-type')} identical=${same}`,
      );
  } catch (e) {
    fails.push(`${id}/${variant}: ${e.message}`);
  }
}
// Mobile variant must differ from desktop for scenes (portrait file), and the old key placeholders are gone.
const scenes = PHASE2_ASSET_SPECS.filter((s) => s.mobileFile);
const distinct = scenes.every(
  (s) => assets.get(s.assetId).drive_file_id !== assets.get(s.assetId).mobile_drive_file_id,
);
console.log(
  `checked ${jobs.length} (asset,variant) fetches: ${ok} passed, ${fails.length} failed; scene desktop/mobile ids distinct: ${distinct}`,
);
for (const f of fails) console.log('  FAIL', f);
server.close();
process.exit(fails.length || !distinct ? 1 : 0);
