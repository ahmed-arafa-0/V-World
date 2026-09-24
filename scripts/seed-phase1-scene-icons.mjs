#!/usr/bin/env node
/**
 * Registers the six player-control icons (icon_walk_forward, icon_walk_back,
 * icon_look_left, icon_look_right, icon_interact, icon_settings) in 10_ASSETS
 * and 09_ICONS. The SVG designs live in assets/phase1/icons/; upload those six
 * files (exact filenames) into the configured Drive asset root first — this
 * backend's Drive client is read-only, so it discovers rather than uploads.
 * Idempotent and append-only: existing rows are never modified. Manually
 * invoked (npm run seed:phase1:icons); excluded from `npm run test`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { DriveGateway } from '../apps/functions/lib/repositories/drive-gateway.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { seedPhase1SceneIcons } from '../apps/functions/lib/services/phase1-scene-icons-seed.service.js';

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

  const outcome = await seedPhase1SceneIcons(gateway, driveGateway, rootFolderId);
  for (const id of outcome.created) console.log(`  CREATED    ${id}`);
  for (const id of outcome.unchanged) console.log(`  UNCHANGED  ${id}`);
  for (const b of outcome.blocked) console.log(`  BLOCKED    ${b.iconId} - ${b.reason}`);
  for (const c of outcome.conflicts) {
    console.log(`  CONFLICT   ${c.tab}.${c.id} differs in [${c.columns.join(', ')}] (left as is)`);
  }
  console.log(
    `\ncreated ${outcome.created.length}, unchanged ${outcome.unchanged.length}, blocked ${outcome.blocked.length}, conflicts ${outcome.conflicts.length}`,
  );
  if (outcome.blocked.length > 0) {
    console.log(
      'Upload the missing SVGs from assets/phase1/icons/ to the Drive asset root, then rerun.',
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
