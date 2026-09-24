#!/usr/bin/env node
/**
 * READ-ONLY, bounded, batched live-Sheet inspection for the real-content-gaps
 * inventory (docs/content/REAL_CONTENT_GAPS.md). Performs exactly ONE Google
 * Sheets batchGet across a fixed, named list of tabs — no writes, no player
 * state touched, no reset. Output is a structured JSON dump to stdout/file
 * for offline analysis; this script does not decide anything on its own.
 */
import { writeFileSync } from 'node:fs';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { getSheetResourceConfig } from '../apps/functions/lib/config/resource-config.js';

const TABS = [
  '07_LANGUAGES',
  '08_UI_TEXT',
  '09_ICONS',
  '10_ASSETS',
  '11_LOCATIONS',
  '12_SCENES',
  '14_STORY_BEATS',
  '15_DIALOGUE',
  '19_MESSAGES',
  '20_SONGS',
  '21_KEYS',
  '22_KEY_RULES',
  '23_ACHIEVEMENTS',
  '30_CHURCH_CONTENT',
  '31_CHURCH_QUIZ',
  '32_ARCADE_GAMES',
  '34_MUSEUM_EXHIBITS',
  '36_CHARACTERS',
  '39_VALIDATION_LISTS',
];

function toRows(header, dataRows) {
  return dataRows
    .filter((r) => r.some((cell) => (cell ?? '').toString().trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').toString()])));
}

async function main() {
  const client = createGoogleSheetsClientOrNull();
  if (!client) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }
  const { spreadsheetId } = getSheetResourceConfig();
  console.error(`Using Sheet ID: ${spreadsheetId.slice(0, 6)}…${spreadsheetId.slice(-4)} (masked)`);

  const gateway = new SheetGateway(client, { ttlSeconds: 60 });

  console.error(`Reading ${TABS.length} tabs in one batched, read-only call…`);
  const raw = await gateway.getRawTabsBatch(TABS, { bypass: true });

  const out = {};
  for (const tab of TABS) {
    const [header, ...dataRows] = raw[tab] ?? [];
    out[tab] = {
      headerRow: header ?? [],
      rowCount: (dataRows ?? []).filter((r) => r.some((c) => (c ?? '').toString().trim() !== ''))
        .length,
      rows: toRows(header ?? [], dataRows ?? []),
    };
  }

  const outPath = process.argv[2] ?? 'scripts/content/real-content-gaps-raw.json';
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.error(`Wrote raw inspection dump to ${outPath}`);
  for (const tab of TABS) {
    console.error(`  ${tab}: ${out[tab].rowCount} row(s)`);
  }
  console.error('\nNo writes were performed. This script is read-only.');
}

main().catch((err) => {
  console.error('Inspection script crashed:');
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
