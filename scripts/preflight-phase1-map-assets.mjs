#!/usr/bin/env node
/**
 * Phase 1 item B safe preflight for the three map-composition Drive files
 * Ahmed supplied (transparent island, top-down ocean loop, ocean poster).
 * Manually invoked only (npm run preflight:phase1:map-assets) — excluded
 * from `npm run test`. Verifies, WITHOUT ever printing a Drive file ID,
 * folder ID, or credential, that each file:
 *  - is reachable by the service account;
 *  - is not trashed;
 *  - reports a MIME type this backend's media gateway will actually accept
 *    for the intended asset family (image/video, poster always image);
 *  - lies under the configured `10_ASSETS` Drive asset root
 *    (`DriveGateway.isUnderRoot`, the same M03-B1 containment check the live
 *    media endpoint enforces on every request).
 *
 * No file content is downloaded — metadata calls only. No Sheet row is
 * written by this script; see `seed-phase1-map-assets.mjs` for the actual
 * (separate, idempotent) 10_ASSETS upsert.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';

const FILES_TO_CHECK = [
  {
    label: 'map_island_transparent (drive_file_id)',
    fileId: '1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8',
    expectedFamily: 'image',
  },
  {
    label: 'map_ocean_loop (drive_file_id)',
    fileId: '1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo',
    expectedFamily: 'video',
  },
  {
    label: 'map_ocean_loop (poster_drive_file_id)',
    fileId: '1de1aBHsIG3PEso7WMALHKIaAVPNberMt',
    expectedFamily: 'image',
  },
];

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
};

function mask(id) {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

let passCount = 0;
let failCount = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`    PASS  ${label}`);
    passCount++;
  } else {
    console.log(`    FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function main() {
  const sheetsClient = createGoogleSheetsClientOrNull();
  const driveClient = createGoogleDriveClientOrNull();
  if (!sheetsClient || !driveClient) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }

  const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
  const driveGateway = new DriveGateway(driveClient);
  const rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
  console.log(`Asset root: ${mask(rootFolderId)} (masked)\n`);

  for (const { label, fileId, expectedFamily } of FILES_TO_CHECK) {
    console.log(`=== ${label} [${mask(fileId)}] ===`);
    try {
      const metadata = await driveGateway.getMetadata(fileId);
      check('Metadata call succeeds', Boolean(metadata.mimeType));
      check('Not trashed', metadata.trashed === false);
      check(
        `MIME type is an allowed "${expectedFamily}" type`,
        ALLOWED_MIME[expectedFamily].includes(metadata.mimeType),
        `reported mimeType: ${metadata.mimeType}`,
      );
      check('Size is known', typeof metadata.size === 'number' && metadata.size > 0);
      const underRoot = await driveGateway.isUnderRoot(metadata, rootFolderId);
      check('Contained under the configured asset root', underRoot);
    } catch (err) {
      check('Metadata call succeeds', false, err instanceof Error ? err.message : String(err));
    }
    console.log('');
  }

  console.log(`Summary: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.error(
      '\nPHASE 1 MAP-ASSET PREFLIGHT FAILED. Do not run the seed script until every check above passes.',
    );
    process.exit(1);
  }
  console.log('\nPHASE 1 MAP-ASSET PREFLIGHT PASSED. No private value was printed.');
}

main().catch((err) => {
  console.error('\nPhase 1 map-asset preflight crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
