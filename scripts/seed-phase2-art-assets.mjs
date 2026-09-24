#!/usr/bin/env node
/**
 * Phase 2 art registration: discovers the 61 PNGs by exact filename (recursively) under the
 * configured Drive asset root (read-only), then idempotently registers 10_ASSETS / 09_ICONS
 * rows and fills the 23_ACHIEVEMENTS icon placeholders. Manually invoked
 * (npm run seed:phase2:art) — excluded from `npm run test`. Drive ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import {
  seedPhase2ArtAssets,
  allPhase2Filenames,
} from '../apps/functions/lib/services/phase2-art-assets-seed.service.js';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const { discovery, outcome } = await seedPhase2ArtAssets(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
);
console.log(`Expected ${allPhase2Filenames().length} filenames; found ${discovery.found.size}.`);
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
