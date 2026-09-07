#!/usr/bin/env node
/**
 * M03-B1 safe preflight. Manually invoked only (npm run preflight:m03b1) —
 * excluded from `npm run test`. Verifies the live Google Drive integration
 * is ready WITHOUT ever printing a Drive file ID, folder ID, credential, or
 * any other private value — only configured/reachable status is reported.
 *
 * Checks:
 *  1. The Google credential loads.
 *  2. The Google Drive API is reachable (a metadata call on the configured
 *     root folder succeeds).
 *  3. `drive_root_folder_id` exists (and is enabled, non-placeholder) in
 *     01_APP_CONFIG.
 *  4. The service account can access that configured root folder, and it is
 *     actually a folder (not a file).
 *
 * No media file is read or downloaded. No log/validation row is touched —
 * see `audit-entry-log-event-types.mjs` for the separate, also read-only,
 * M03-B1 legacy event-type audit.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section('1. Google credential');
  const sheetsClient = createGoogleSheetsClientOrNull();
  check('Real Google credential is present and loads', sheetsClient !== null);

  const driveClient = createGoogleDriveClientOrNull();
  check('Drive client can be constructed from the same credential', driveClient !== null);

  if (!sheetsClient || !driveClient) {
    console.error(
      '\nBLOCKER: no Google credential available. Stopping — cannot run the live suite.',
    );
    process.exit(1);
  }

  section('2. drive_root_folder_id in 01_APP_CONFIG');
  const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
  let rootFolderId;
  try {
    rootFolderId = await getDriveRootFolderId(gateway, { bypass: true });
    check('drive_root_folder_id is configured (enabled, non-placeholder)', true);
  } catch (err) {
    check('drive_root_folder_id is configured (enabled, non-placeholder)', false, err.message);
  }

  if (!rootFolderId) {
    console.error(
      '\nBLOCKER: drive_root_folder_id is not usable. Stopping before any Drive API call.',
    );
    process.exit(1);
  }
  console.log(`  Root folder ID: ${rootFolderId.slice(0, 4)}…${rootFolderId.slice(-4)} (masked)`);

  section('3. Google Drive API reachability and root-folder access');
  try {
    const metadata = await driveClient.getFileMetadata(rootFolderId);
    check('Drive API metadata call for the configured root succeeds', Boolean(metadata.id));
    check(
      'The configured root folder is actually a folder (not a file)',
      metadata.mimeType === 'application/vnd.google-apps.folder',
      `reported mimeType: ${metadata.mimeType}`,
    );
    check('The configured root folder is not trashed', metadata.trashed === false);
  } catch (err) {
    check('Drive API metadata call for the configured root succeeds', false, err.message);
  }

  section('Summary');
  console.log(`  ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    console.error('\nM03-B1 PREFLIGHT FAILED — stopping with a sanitized blocker.');
    console.error('No Drive file ID, folder ID, or credential value was printed above.');
    process.exit(1);
  }

  console.log('\nM03-B1 PREFLIGHT PASSED. No private value was printed.');
}

main().catch((err) => {
  console.error('\nM03-B1 PREFLIGHT crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
