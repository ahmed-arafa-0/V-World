#!/usr/bin/env node
/**
 * Discovers the 50 story-gallery paintings listed in
 * `assets/Veoulla_Content_Banks_v1/asset_manifest.json` by exact filename (read-only) under the
 * configured Drive asset root, idempotently upserts their `10_ASSETS` rows, then links each image
 * to its story's `30_CHURCH_CONTENT.image_asset_ids` cell (every locale row sharing that story's
 * `content_id`, only where currently blank). Manually invoked (npm run seed:church-story-images) —
 * excluded from `npm run test`. Never uploads anything. Drive ids are printed masked.
 */
import fs from 'node:fs';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { seedChurchStoryImages } from '../apps/functions/lib/services/church-story-image-seed.service.js';

const manifest = JSON.parse(
  fs.readFileSync(
    new URL('../assets/Veoulla_Content_Banks_v1/asset_manifest.json', import.meta.url),
    'utf8',
  ),
);
const specs = manifest.assets.map((a) => ({
  assetId: a.asset_id,
  storyId: a.story_id,
  filename: a.filename,
  mimeType: a.mime_type,
}));

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60, maxRequestsPerMinute: 52 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const { discovery, outcome } = await seedChurchStoryImages(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
  specs,
);

const mask = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
console.log(`Expected ${specs.length} filenames; found ${discovery.found.size}.`);
for (const [name, f] of discovery.found)
  console.log(`  FOUND     ${name} [${mask(f.fileId)}] (${f.mimeType})`);
for (const c of outcome.created) console.log(`  CREATED   10_ASSETS.${c} (version 1)`);
for (const u of outcome.updated)
  console.log(`  UPDATED   10_ASSETS.${u.assetId} (version ${u.version})`);
for (const u of outcome.unchanged) console.log(`  UNCHANGED 10_ASSETS.${u}`);
for (const b of outcome.blocked)
  console.log(`  BLOCKED   ${b.assetId} (${b.storyId}): ${b.reasons.join('; ')}`);
for (const l of outcome.linked)
  console.log(`  LINKED    30_CHURCH_CONTENT.${l.contentRowId} -> image_asset_ids=${l.assetId}`);
for (const id of outcome.alreadyLinked) console.log(`  ALREADY LINKED 30_CHURCH_CONTENT.${id}`);

console.log(
  `\n10_ASSETS: created ${outcome.created.length}, updated ${outcome.updated.length}, unchanged ${outcome.unchanged.length}, blocked ${outcome.blocked.length}`,
);
console.log(
  `30_CHURCH_CONTENT: linked ${outcome.linked.length}, already linked ${outcome.alreadyLinked.length}`,
);
if (outcome.blocked.length > 0) {
  console.log(
    `\n${outcome.blocked.length} file(s) were not found on Drive yet under the configured root. Missing filenames (source folder: assets/Veoulla_Content_Banks_v1/images/):`,
  );
  for (const b of outcome.blocked) console.log(`  - ${b.filename}`);
  console.log('Upload them with their exact filenames, then re-run this script.');
}
