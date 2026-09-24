#!/usr/bin/env node
/**
 * Phase 1 art handoff — discovery + idempotent seed for the 16 real
 * Gate/Beach/Church/character PNGs Ahmed uploaded to Drive under the
 * configured asset root, preserving the exact filenames from
 * assets/phase1/asset_manifest.json. Manually invoked only
 * (npm run seed:phase1:scene-assets) — excluded from `npm run test`.
 *
 * Discovers each file by exact name (read-only — this backend's Drive
 * client has no upload/write capability), validates MIME + containment
 * under the asset root + uniqueness, then idempotently upserts only the
 * `10_ASSETS` rows whose required file(s) were all found — mirroring the
 * Phase 1 item B seed pattern (`seedPhase1MapAssets`) exactly. No Drive
 * file ID is ever printed unmasked; no Drive file ID is invented.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { seedPhase1SceneCharacterAssets } from '../apps/functions/lib/services/phase1-scene-character-assets-seed.service.js';

function mask(id) {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function printOutcome(label, outcome) {
  for (const key of outcome.created) console.log(`  CREATED    ${label}.${key}`);
  for (const key of outcome.updated) console.log(`  UPDATED    ${label}.${key}`);
  for (const key of outcome.unchanged) console.log(`  UNCHANGED  ${label}.${key}`);
  for (const b of outcome.blocked) {
    console.log(`  BLOCKED    ${label}.${b.assetId}`);
    for (const reason of b.reasons) console.log(`             - ${reason}`);
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

  console.log('=== Discovering + registering Phase 1 scene/character assets ===');
  const { discovery, outcome } = await seedPhase1SceneCharacterAssets(
    gateway,
    driveGateway,
    rootFolderId,
  );

  if (discovery.issues.length > 0) {
    console.log('\n--- Discovery issues (by filename) ---');
    for (const issue of discovery.issues) {
      console.log(
        `  ${issue.issue.toUpperCase().padEnd(16)} ${issue.filename}${issue.detail ? ` — ${issue.detail}` : ''}`,
      );
    }
  } else {
    console.log(`\nAll ${discovery.found.size} expected filenames were found, unique, and valid.`);
  }

  console.log('\n--- 10_ASSETS upsert outcome ---');
  printOutcome('10_ASSETS', outcome);

  console.log('\n=== Summary ===');
  console.log(
    `  created: ${outcome.created.length}, updated: ${outcome.updated.length}, unchanged: ${outcome.unchanged.length}, blocked: ${outcome.blocked.length}`,
  );

  if (outcome.blocked.length > 0) {
    console.log(
      '\nSome assets were NOT registered — see BLOCKED reasons above. Every other asset was still registered normally.',
    );
  }
  console.log('\nPHASE 1 SCENE/CHARACTER ASSET SEED COMPLETE.');
}

main().catch((err) => {
  console.error('\nPhase 1 scene/character asset seed crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
