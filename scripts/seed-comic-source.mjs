#!/usr/bin/env node
/**
 * Verifies Ahmed's supplied comic PDF (a known Drive file ID, not filename
 * discovery) is not trashed, is application/pdf, and lives under the
 * configured Drive asset root, then idempotently upserts its `10_ASSETS`
 * row (`comic_pdf_2025`) — the asset `exhibit_comic_2025` (Museum "Stories"
 * wing) already references via `source_content_id`. Manually invoked
 * (npm run seed:comic-source) — excluded from `npm run test`. Never uploads
 * anything. Drive ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { seedComicSource } from '../apps/functions/lib/services/comic-source-seed.service.js';

const FILE_ID = process.argv[2] ?? '1B7VxmnWGKpiY9nyzS9TK9VU9spvxE7U0';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}

const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
const outcome = await seedComicSource(
  gateway,
  new DriveGateway(driveClient),
  rootFolderId,
  FILE_ID,
);

const mask = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
console.log(`File: [${mask(outcome.verification.fileId)}]`);
console.log(`  trashed:    ${outcome.verification.trashed}`);
console.log(
  `  mimeType:   ${outcome.verification.mimeType} (${outcome.verification.mimeOk ? 'OK' : 'REJECTED'})`,
);
console.log(`  underRoot:  ${outcome.verification.underRoot}`);

switch (outcome.kind) {
  case 'blocked':
    console.log(`\nBLOCKED: ${outcome.reasons.join('; ')}`);
    console.log('Nothing was written to 10_ASSETS.');
    process.exit(1);
    break;
  case 'created':
    console.log('\nCREATED   10_ASSETS.comic_pdf_2025 (version 1)');
    break;
  case 'updated':
    console.log(`\nUPDATED   10_ASSETS.comic_pdf_2025 (version ${outcome.version})`);
    break;
  case 'unchanged':
    console.log('\nUNCHANGED 10_ASSETS.comic_pdf_2025 (already registered with this file)');
    break;
}
console.log(
  '\nexhibit_comic_2025.source_content_id already points at comic_pdf_2025 (see docs/content/REAL_CONTENT_GAPS.md §9) — no change needed there.',
);
