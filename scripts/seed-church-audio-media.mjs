#!/usr/bin/env node
/**
 * Discovers the 3 supplied audio files (Church bell, Gospel reading, Café/Walkman song) by exact
 * filename (read-only) under the configured Drive asset root, then idempotently upserts their
 * `10_ASSETS` rows and registers the song in `20_SONGS`. Manually invoked
 * (npm run seed:church-audio-media) — excluded from `npm run test`. Never uploads anything. Drive
 * ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import {
  seedChurchAudioMedia,
  allChurchAudioMediaFilenames,
} from '../apps/functions/lib/services/church-audio-media-seed.service.js';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const { discovery, outcome } = await seedChurchAudioMedia(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
);

const mask = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
console.log(
  `Expected ${allChurchAudioMediaFilenames().length} filenames; found ${discovery.found.size}.`,
);
for (const [name, f] of discovery.found)
  console.log(`  FOUND     ${name} [${mask(f.fileId)}] (${f.mimeType})`);
for (const i of discovery.issues)
  console.log(`  ISSUE     ${i.filename}: ${i.issue} ${i.detail ?? ''}`);
for (const c of outcome.created) console.log(`  CREATED   10_ASSETS.${c} (version 1)`);
for (const u of outcome.updated)
  console.log(`  UPDATED   10_ASSETS.${u.assetId} (version ${u.version})`);
for (const u of outcome.unchanged) console.log(`  UNCHANGED 10_ASSETS.${u}`);
for (const b of outcome.blocked)
  console.log(`  BLOCKED   10_ASSETS.${b.assetId}: ${b.reasons.join('; ')}`);
console.log(
  `\n10_ASSETS: created ${outcome.created.length}, updated ${outcome.updated.length}, unchanged ${outcome.unchanged.length}, blocked ${outcome.blocked.length}`,
);
console.log(
  `20_SONGS: created ${outcome.songCatalog.created.length}, already existing ${outcome.songCatalog.existing.length}`,
);
if (outcome.blocked.length > 0) {
  console.log(
    '\nSome files were not found on Drive yet under the configured root. Upload them with their exact filenames, then re-run this script.',
  );
}
