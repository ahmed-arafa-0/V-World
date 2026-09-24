#!/usr/bin/env node
/**
 * Discovers the comic PDF inside a Drive FOLDER (not a known file ID) —
 * verifies the folder itself is a real, non-trashed folder under the
 * configured Drive asset root, lists its direct children, and if exactly
 * one is a `application/pdf` file, registers it through the same
 * idempotent `10_ASSETS.comic_pdf_2025` upsert as `seed-comic-source.mjs`.
 * If zero or more than one PDF candidate exists, reports filenames and
 * writes nothing. Manually invoked (npm run seed:comic-source-from-folder)
 * — excluded from `npm run test`. Never uploads anything, never puts a
 * folder ID into an asset's `drive_file_id`. Drive ids are printed masked.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { seedComicSource } from '../apps/functions/lib/services/comic-source-seed.service.js';

const FOLDER_ID = process.argv[2] ?? '1JsFD1SIVl36pGS1yKiccGZBu7n-nwfnq';

const sheetsClient = createGoogleSheetsClientOrNull();
const driveClient = createGoogleDriveClientOrNull();
if (!sheetsClient || !driveClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}

const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const driveGateway = new DriveGateway(driveClient);
const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });

const mask = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
console.log(`Folder: [${mask(FOLDER_ID)}]`);

const discovery = await driveGateway.discoverPdfsInFolder(FOLDER_ID, rootFolderId);

if (discovery.kind === 'folder_not_found') {
  console.log(`\nBLOCKED: ${discovery.reason}.`);
  console.log('Nothing was written to 10_ASSETS.');
  process.exit(1);
}
if (discovery.kind === 'no_pdfs') {
  console.log(
    `\nBLOCKED: no application/pdf file found directly inside this folder (${discovery.children.length} other item(s) present):`,
  );
  for (const c of discovery.children) console.log(`  - ${c.name} (${c.mimeType})`);
  console.log('Nothing was written to 10_ASSETS.');
  process.exit(1);
}
if (discovery.kind === 'ambiguous') {
  console.log(
    `\nBLOCKED: ${discovery.pdfs.length} candidate PDFs found — pick one and re-run with its file ID via seed-comic-source.mjs:`,
  );
  for (const p of discovery.pdfs) console.log(`  - ${p.name} [${mask(p.id)}]`);
  console.log('Nothing was written to 10_ASSETS.');
  process.exit(1);
}

console.log(`Found exactly one PDF: ${discovery.pdf.name} [${mask(discovery.pdf.id)}]`);
const outcome = await seedComicSource(gateway, driveGateway, rootFolderId, discovery.pdf.id);

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
