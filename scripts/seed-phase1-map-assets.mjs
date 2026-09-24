#!/usr/bin/env node
/**
 * Phase 1 item B idempotent map-asset seed. Manually invoked only
 * (npm run seed:phase1:map-assets) — excluded from `npm run test`. Thin CLI
 * wrapper around the tested `seedPhase1MapAssets` function in
 * apps/functions/src/services/phase1-map-assets-seed.service.ts, so the
 * seed logic itself is unit-tested against a fake Sheet client and this
 * script only prints the result of running it against the real Sheet.
 *
 * Registers the two existing map-composition assets Ahmed supplied
 * (transparent island, top-down ocean loop + poster) into 10_ASSETS. Never
 * reads or writes 02_USERS, and never downloads or prints a Drive file.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { seedPhase1MapAssets } from '../apps/functions/lib/services/phase1-map-assets-seed.service.js';

function printOutcome(label, outcome) {
  for (const key of outcome.created) console.log(`  CREATED  ${label}.${key}`);
  for (const key of outcome.updated) console.log(`  UPDATED  ${label}.${key}`);
  for (const key of outcome.unchanged) console.log(`  UNCHANGED  ${label}.${key}`);
}

async function main() {
  const client = createGoogleSheetsClientOrNull();
  if (!client) {
    console.error('BLOCKER: no Google credential available. Stopping seed.');
    process.exit(1);
  }

  const gateway = new SheetGateway(client, { ttlSeconds: 60 });

  console.log('=== Upserting 10_ASSETS map-composition rows ===');
  const outcome = await seedPhase1MapAssets(gateway);
  printOutcome('10_ASSETS', outcome);

  console.log('\n=== Summary ===');
  console.log(
    `  created: ${outcome.created.length}, updated: ${outcome.updated.length}, unchanged: ${outcome.unchanged.length}`,
  );
  console.log('\nPHASE 1 ITEM B MAP-ASSET SEED COMPLETE.');
}

main().catch((err) => {
  console.error('\nPhase 1 map-asset seed crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
