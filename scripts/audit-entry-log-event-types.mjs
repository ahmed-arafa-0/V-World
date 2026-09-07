#!/usr/bin/env node
/**
 * M03-B1 read-only audit of `05_ENTRY_LOGS` controlled-list violations.
 * Manually invoked only (npm run audit:entry-log-events) — excluded from
 * `npm run test`.
 *
 * The M03-B milestone prompt asked specifically about "153 historical
 * 05_ENTRY_LOGS.event_type controlled-list errors," based on the M03-A
 * checkpoint report's own (as it turns out, imprecise) description of a
 * live schema-health error count. This script checks BOTH controlled-list
 * columns 05_ENTRY_LOGS actually has (`event_type` against
 * `entry_event_type`, and `language` against `locale`) and reports which
 * one is truly responsible — see the M03-B1 checkpoint report for the
 * corrected finding.
 *
 * SAFETY CONTRACT (never violated by this script):
 *  - Never writes, updates, or deletes any row in any tab.
 *  - Never prints a row ID (log_id/session_id), IP address, device ID, user
 *    ID, cookie, credential, Gate value, or Admin value.
 *  - Never prints a full log row — only an aggregated column value, its
 *    occurrence count, and its earliest/latest timestamp.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { buildValidationListSets } from '@veoullas-world/sheet-schema';

function categorizeEventType(value, validValues) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const valid of validValues) {
    if (valid.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) {
      return 'legitimate legacy event (case/format variant of an accepted value)';
    }
  }
  if (/test|fixture|debug|fake|sample|dummy/.test(value.toLowerCase())) {
    return 'automated test event';
  }
  return 'unknown';
}

function categorizeLanguage(value, validValues) {
  const base = value.split('-')[0]?.toLowerCase();
  if (validValues.some((v) => v.toLowerCase() === base)) {
    return `legitimate browser locale (BCP-47 form of accepted locale "${base}", e.g. navigator.language "en-US" vs. the app's own locale code "en")`;
  }
  if (/test|fixture|debug|fake|sample|dummy/.test(value.toLowerCase())) {
    return 'automated test event';
  }
  return 'unknown — base language not among the five supported app locales';
}

function auditColumn(rows, columnIdx, timestampIdx, validValues, categorize) {
  const groups = new Map();
  let invalidRows = 0;

  for (const r of rows) {
    const value = columnIdx === -1 ? '' : (r[columnIdx] ?? '');
    if (!value || validValues.has(value)) continue;

    invalidRows++;
    const timestamp = r[timestampIdx] ?? '';
    let group = groups.get(value);
    if (!group) {
      group = { count: 0, earliest: null, latest: null };
      groups.set(value, group);
    }
    group.count++;
    if (timestamp) {
      if (!group.earliest || timestamp < group.earliest) group.earliest = timestamp;
      if (!group.latest || timestamp > group.latest) group.latest = timestamp;
    }
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [value, group] of sorted) {
    console.log(`  - ${JSON.stringify(value)}`);
    console.log(`      occurrences: ${group.count}`);
    console.log(`      earliest timestamp: ${group.earliest ?? '(unavailable)'}`);
    console.log(`      latest timestamp:   ${group.latest ?? '(unavailable)'}`);
    console.log(`      likely category: ${categorize(value, [...validValues])}`);
  }
  if (sorted.length === 0) {
    console.log('  (no invalid values found)');
  }

  return invalidRows;
}

async function main() {
  const client = createGoogleSheetsClientOrNull();
  if (!client) {
    console.error('BLOCKER: no Google credential available.');
    process.exit(1);
  }

  const gateway = new SheetGateway(client, { ttlSeconds: 60 });

  const [entryLogsRaw, validationListsRaw] = await Promise.all([
    gateway.getRawTab('05_ENTRY_LOGS', { bypass: true }),
    gateway.getRawTab('39_VALIDATION_LISTS', { bypass: true }),
  ]);

  const [entryHeader, ...entryRows] = entryLogsRaw;
  const nonBlankRows = entryRows.filter((r) => r.some((cell) => cell && cell.trim() !== ''));
  const timestampIdx = entryHeader.indexOf('timestamp');
  const eventTypeIdx = entryHeader.indexOf('event_type');
  const languageIdx = entryHeader.indexOf('language');

  const [vHeader, ...vRows] = validationListsRaw;
  const lists = buildValidationListSets(vHeader, vRows);
  const validEventTypes = lists['entry_event_type'] ?? new Set();
  const validLocales = lists['locale'] ?? new Set();

  console.log(`Total 05_ENTRY_LOGS rows scanned: ${nonBlankRows.length}`);

  console.log(`\nAccepted entry_event_type values (${validEventTypes.size}):`);
  console.log(`  ${[...validEventTypes].join(', ')}`);
  console.log('\n=== event_type audit ===');
  const invalidEventTypeRows = auditColumn(
    nonBlankRows,
    eventTypeIdx,
    timestampIdx,
    validEventTypes,
    categorizeEventType,
  );
  console.log(`\nRows with an invalid event_type: ${invalidEventTypeRows}`);

  console.log(`\nAccepted locale values (${validLocales.size}):`);
  console.log(`  ${[...validLocales].join(', ')}`);
  console.log(
    '\n=== language audit (the column actually driving the live schema-health error count) ===',
  );
  const invalidLanguageRows = auditColumn(
    nonBlankRows,
    languageIdx,
    timestampIdx,
    validLocales,
    categorizeLanguage,
  );
  console.log(`\nRows with an invalid language: ${invalidLanguageRows}`);

  console.log(
    '\nNo row was modified. No row ID, IP, device, user, or credential was printed above.',
  );
}

main().catch((err) => {
  console.error('AUDIT crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
