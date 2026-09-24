#!/usr/bin/env node
/**
 * birthday_2026 art registration: discovers the 7 supplied PNGs by exact filename under the
 * configured Drive asset root (read-only), then idempotently registers the 5 `10_ASSETS` rows
 * (the garden as one scene asset with a desktop + portrait variant) and the achievement badge's
 * `09_ICONS` row, filling the `23_ACHIEVEMENTS.birthday_2026_celebrated` icon placeholder. Manually
 * invoked (npm run seed:birthday:art) — excluded from `npm run test`. Drive ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import {
  seedBirthdayArtAssets,
  allBirthdayFilenames,
} from '../apps/functions/lib/services/birthday-art-assets-seed.service.js';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const { discovery, outcome } = await seedBirthdayArtAssets(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
);
console.log(`Expected ${allBirthdayFilenames().length} filenames; found ${discovery.found.size}.`);
for (const i of discovery.issues) console.log(`  ISSUE ${i.issue} ${i.filename} ${i.detail ?? ''}`);
for (const c of outcome.created) console.log(`  CREATED   ${c}`);
for (const u of outcome.updated)
  console.log(
    `  UPDATED   ${u.tab}.${u.id} [${u.columns.join(',')}]${u.version ? ` v${u.version}` : ''}`,
  );
for (const b of outcome.blocked) console.log(`  BLOCKED   ${b.id}: ${b.reasons.join('; ')}`);
console.log(
  `\ncreated ${outcome.created.length}, updated ${outcome.updated.length}, unchanged ${outcome.unchanged.length}, blocked ${outcome.blocked.length}`,
);
