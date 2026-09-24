#!/usr/bin/env node
/**
 * Church candle-patch art registration: discovers the 4 PNGs
 * (`assets/Veoulla_Church_Candle_Patch/images/`) by exact filename (read-only) under the configured
 * Drive asset root, then idempotently upserts the two `10_ASSETS` rows (`church_interior_scene` —
 * existing, version bumped; `church_candle_corner_scene` — new, version 1). Manually invoked
 * (npm run seed:church-candle-patch) — excluded from `npm run test`. Never uploads anything; Ahmed
 * uploads the files to Drive first. Drive ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import {
  seedChurchCandlePatchAssets,
  allChurchCandlePatchFilenames,
} from '../apps/functions/lib/services/church-candle-patch-assets-seed.service.js';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const { discovery, outcome } = await seedChurchCandlePatchAssets(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
);

const mask = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
console.log(
  `Expected ${allChurchCandlePatchFilenames().length} filenames; found ${discovery.found.size}.`,
);
for (const [name, f] of discovery.found) console.log(`  FOUND     ${name} [${mask(f.fileId)}]`);
for (const i of discovery.issues)
  console.log(`  ISSUE     ${i.filename}: ${i.issue} ${i.detail ?? ''}`);
for (const c of outcome.created) console.log(`  CREATED   10_ASSETS.${c} (version 1)`);
for (const u of outcome.updated)
  console.log(`  UPDATED   10_ASSETS.${u.assetId} (version ${u.version})`);
for (const u of outcome.unchanged) console.log(`  UNCHANGED 10_ASSETS.${u}`);
for (const b of outcome.blocked)
  console.log(`  BLOCKED   10_ASSETS.${b.assetId}: ${b.reasons.join('; ')}`);
console.log(
  `\ncreated ${outcome.created.length}, updated ${outcome.updated.length}, unchanged ${outcome.unchanged.length}, blocked ${outcome.blocked.length}`,
);
if (outcome.blocked.length > 0) {
  console.log(
    '\nSome files were not found on Drive yet. Upload the 4 files under images/ to the configured Drive asset root with their exact filenames, then re-run this script.',
  );
}
