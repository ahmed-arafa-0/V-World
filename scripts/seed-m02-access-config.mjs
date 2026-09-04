#!/usr/bin/env node
/**
 * M02-A idempotent access-configuration seed. Manually invoked only
 * (npm run seed:m02) — excluded from `npm run test`. Thin CLI wrapper
 * around the tested `seedAccessAppConfig` / `seedEntryEventTypeValidationList`
 * functions in apps/functions/src/services/access-config-seed.service.ts,
 * so the seed logic itself is unit-tested against a fake Sheet client and
 * this script only prints the result of running it against the real Sheet.
 * Never reads or writes 02_USERS (the Gate code / Admin password tab).
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  seedAccessAppConfig,
  seedEntryEventTypeValidationList,
} from '../apps/functions/lib/services/access-config-seed.service.js';

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

  console.log('=== Upserting 01_APP_CONFIG access-config rows ===');
  const appConfigOutcome = await seedAccessAppConfig(gateway);
  printOutcome('01_APP_CONFIG', appConfigOutcome);

  console.log('\n=== Upserting 39_VALIDATION_LISTS entry_event_type values ===');
  const validationListOutcome = await seedEntryEventTypeValidationList(gateway);
  printOutcome('39_VALIDATION_LISTS[entry_event_type]', validationListOutcome);

  const created = appConfigOutcome.created.length + validationListOutcome.created.length;
  const updated = appConfigOutcome.updated.length + validationListOutcome.updated.length;
  const unchanged = appConfigOutcome.unchanged.length + validationListOutcome.unchanged.length;

  console.log('\n=== Summary ===');
  console.log(`  created: ${created}, updated: ${updated}, unchanged: ${unchanged}`);
  console.log('\nM02-A SEED COMPLETE.');
}

main().catch((err) => {
  console.error('\nM02-A SEED crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
