#!/usr/bin/env node
/**
 * M01 live verification. Manually invoked only (npm run test:m01:live) —
 * excluded from `npm run test`. Uses the real backend-only credential and the
 * actual gateway/service code (imported from the compiled apps/functions/lib
 * output) to prove the live integration works, without polluting the Sheet.
 *
 * The only write this script performs is a reversible probe on
 * 01_APP_CONFIG.app_name: read the original value, temporarily change it,
 * verify the change, then restore the exact original value in a finally
 * block. If restoration ever fails, this script reports it loudly and exits
 * non-zero rather than leaving the Sheet altered.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { getSheetResourceConfig } from '../apps/functions/lib/config/resource-config.js';
import { buildBootstrapResponse } from '../apps/functions/lib/services/bootstrap.service.js';
import { computeSchemaHealth } from '../apps/functions/lib/services/schema-health.service.js';
import { EXPECTED_TAB_COUNT, TAB_NAMES } from '@veoullas-world/sheet-schema';

const EXPECTED_DRIVE_FOLDER_ID = '1JsFD1SIVl36pGS1yKiccGZBu7n-nwfnq';

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
  section('1. Credential and Sheet resource configuration');
  const client = createGoogleSheetsClientOrNull();
  check('Real Google credential is present and loads', client !== null);
  if (!client) {
    console.error(
      '\nBLOCKER: no Google credential available. Stopping — cannot run the live suite.',
    );
    process.exit(1);
  }

  const { spreadsheetId } = getSheetResourceConfig();
  console.log(`  Using Sheet ID: ${spreadsheetId.slice(0, 6)}…${spreadsheetId.slice(-4)} (masked)`);

  const gateway = new SheetGateway(client, { ttlSeconds: 60 });

  section('2. Spreadsheet access and tab names');
  const metadata = await gateway.getMetadata({ bypass: true });
  check('Sheets API metadata call succeeds', Boolean(metadata.title));
  check(
    `Exactly ${EXPECTED_TAB_COUNT} tabs found`,
    metadata.tabTitles.length === EXPECTED_TAB_COUNT,
    `found ${metadata.tabTitles.length}`,
  );

  const missing = TAB_NAMES.filter((t) => !metadata.tabTitles.includes(t));
  const extra = metadata.tabTitles.filter((t) => !TAB_NAMES.includes(t));
  check(
    'All 42 expected tab names are present',
    missing.length === 0,
    `missing: ${JSON.stringify(missing)}`,
  );
  check('No unexpected tab names', extra.length === 0, `extra: ${JSON.stringify(extra)}`);

  section('3. drive_root_folder_id in 01_APP_CONFIG');
  const appConfigRaw = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });
  const [configHeader, ...configRows] = appConfigRaw;
  const keyIdx = configHeader.indexOf('config_key');
  const valIdx = configHeader.indexOf('value');
  const driveRow = configRows.find((r) => r[keyIdx] === 'drive_root_folder_id');
  check('drive_root_folder_id row exists', Boolean(driveRow));
  check(
    'drive_root_folder_id matches the approved Drive folder ID',
    driveRow?.[valIdx] === EXPECTED_DRIVE_FOLDER_ID,
  );

  section('4. Bootstrap data (5 languages, 8 locations, 18 first-journey beats, current event)');
  const bootstrap = await buildBootstrapResponse(gateway, { bypass: true });
  check(
    'Exactly 5 enabled languages',
    bootstrap.languages.length === 5,
    `found ${bootstrap.languages.length}`,
  );
  check(
    'Exactly 8 enabled locations',
    bootstrap.locations.length === 8,
    `found ${bootstrap.locations.length}`,
  );
  check(
    'Exactly 18 enabled first-journey beats',
    bootstrap.storyBeats.length === 18,
    `found ${bootstrap.storyBeats.length}`,
  );
  check('A current event is configured and resolved', bootstrap.currentEvent !== null);
  check(
    'Bootstrap payload contains no raw Drive file ID',
    !JSON.stringify(bootstrap.assets).match(/drive_file_id/i),
  );

  section('5. Schema health');
  const health = await computeSchemaHealth(gateway, { bypass: true });
  check('Schema health computed without throwing', health.ok === true);
  check(
    'No structural ERROR diagnostics on the live workbook',
    health.summary.errorCount === 0,
    `${health.summary.errorCount} error(s)`,
  );
  console.log(
    `  Status: ${health.summary.status} (${health.summary.warningCount} warning(s), ${health.summary.infoCount} info)`,
  );

  section('6. Cache bypass proof (read-only)');
  const first = await gateway.getRawTab('01_APP_CONFIG');
  const second = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });
  check(
    'Bypass read succeeds independently of the cached read',
    Array.isArray(second) && second.length === first.length,
  );

  section('7. Reversible write probe on 01_APP_CONFIG.app_name');
  const appNameRow = configRows.find((r) => r[keyIdx] === 'app_name');
  check('app_name row exists', Boolean(appNameRow));
  const originalAppName = appNameRow?.[valIdx] ?? '';
  console.log(`  Original app_name: "${originalAppName}"`);

  const probeValue = `M01_LIVE_PROBE_${Date.now()}`;
  let restored = false;

  try {
    await gateway.updateByPrimaryKey('01_APP_CONFIG', 'app_name', { value: probeValue });

    const afterProbe = await gateway.findByPrimaryKey('01_APP_CONFIG', 'app_name', {
      bypass: true,
    });
    check(
      'Probe value was written and is visible on a cache-bypassed read',
      afterProbe?.row.raw.value === probeValue,
    );
  } finally {
    await gateway.updateByPrimaryKey('01_APP_CONFIG', 'app_name', { value: originalAppName });
    const afterRestore = await gateway.findByPrimaryKey('01_APP_CONFIG', 'app_name', {
      bypass: true,
    });
    restored = afterRestore?.row.raw.value === originalAppName;

    if (!restored) {
      console.error(
        '\n🚨 CRITICAL: failed to restore the original app_name value in the live Sheet!',
      );
      console.error(`   Expected: "${originalAppName}"`);
      console.error(`   Found:    "${afterRestore?.row.raw.value}"`);
      console.error(
        '   Manual intervention is required to fix 01_APP_CONFIG.app_name in the live Sheet.',
      );
    }
    check('Original app_name value was restored exactly', restored);
  }

  section('Summary');
  console.log(`  ${passCount} passed, ${failCount} failed`);

  if (failCount > 0 || !restored) {
    console.error('\nM01 LIVE VERIFICATION FAILED.');
    process.exit(1);
  }

  console.log('\nM01 LIVE VERIFICATION PASSED. app_name was restored to its original value.');
}

main().catch((err) => {
  console.error('\nM01 LIVE VERIFICATION crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
