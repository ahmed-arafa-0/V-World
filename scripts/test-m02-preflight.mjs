#!/usr/bin/env node
/**
 * M02-A safe preflight. Manually invoked only (npm run preflight:m02) —
 * excluded from `npm run test`. Verifies the live Sheet is ready for M02
 * access-foundation work WITHOUT ever printing a Gate code, an Admin
 * password, or any other access value — only configured/not-configured
 * status is reported, per the M02-A instructions.
 *
 * Checks:
 *  1. Real Sheet connection works.
 *  2. `veoulla` is the single active owner.
 *  3. Its Gate value exists, is not a placeholder, and is exactly 4 digits.
 *  4. `admin_ahmed` is an active Admin.
 *  5. Its Admin password exists and is not a placeholder.
 *  6. log_sample_001 / log_sample_002 / sess_sample_001 are absent.
 *  7. The Google credential remains ignored by Git.
 */
import { execFileSync } from 'node:child_process';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';

const PLACEHOLDER_RE = /^<[^<>]+>$/;
const GATE_CODE_RE = /^\d{4}$/;

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

function isBlank(raw) {
  return raw === undefined || raw === null || raw.trim() === '';
}

function isConfiguredSecret(raw) {
  return !isBlank(raw) && !PLACEHOLDER_RE.test(raw.trim());
}

async function main() {
  section('1. Real Sheet connection');
  const client = createGoogleSheetsClientOrNull();
  check('Real Google credential is present and loads', client !== null);
  if (!client) {
    console.error('\nBLOCKER: no Google credential available. Stopping preflight.');
    process.exit(1);
  }

  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  const metadata = await gateway.getMetadata({ bypass: true });
  check('Sheets API metadata call succeeds', Boolean(metadata.title));

  section('2. 02_USERS — owner and Admin rows');
  const usersRaw = await gateway.getRawTab('02_USERS', { bypass: true });
  const [usersHeader, ...usersRows] = usersRaw;
  const col = (name) => usersHeader.indexOf(name);
  const idIdx = col('user_id');
  const roleIdx = col('role');
  const activeIdx = col('active');
  const gateIdx = col('gate_code_plaintext');
  const adminPassIdx = col('admin_password_plaintext');

  const activeOwners = usersRows.filter(
    (r) => r[roleIdx] === 'owner' && /^true$/i.test(r[activeIdx] ?? ''),
  );
  check(
    'Exactly one active owner exists',
    activeOwners.length === 1,
    `found ${activeOwners.length}`,
  );
  const owner = activeOwners.find((r) => r[idIdx] === 'veoulla');
  check('The single active owner is "veoulla"', Boolean(owner));

  section('3. Gate value (status only — value never printed)');
  const gateRaw = owner?.[gateIdx];
  check('Gate value is configured (present, not a placeholder)', isConfiguredSecret(gateRaw));
  check('Gate value is exactly four digits', Boolean(gateRaw) && GATE_CODE_RE.test(gateRaw.trim()));

  section('4. Admin row — admin_ahmed');
  const admin = usersRows.find((r) => r[idIdx] === 'admin_ahmed');
  check('admin_ahmed row exists', Boolean(admin));
  check('admin_ahmed has role "admin"', admin?.[roleIdx] === 'admin');
  check('admin_ahmed is active', Boolean(admin) && /^true$/i.test(admin[activeIdx] ?? ''));

  section('5. Admin password (status only — value never printed)');
  const adminPassRaw = admin?.[adminPassIdx];
  check(
    'Admin password is configured (present, not a placeholder)',
    isConfiguredSecret(adminPassRaw),
  );

  section('6. Sample rows absent');
  const entryLogsRaw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
  const [entryHeader, ...entryRows] = entryLogsRaw;
  const logIdIdx = entryHeader.indexOf('log_id');
  const sampleLogIds = new Set(entryRows.map((r) => r[logIdIdx]));
  check('log_sample_001 is absent from 05_ENTRY_LOGS', !sampleLogIds.has('log_sample_001'));
  check('log_sample_002 is absent from 05_ENTRY_LOGS', !sampleLogIds.has('log_sample_002'));

  const sessionsRaw = await gateway.getRawTab('06_SESSIONS', { bypass: true });
  const [sessionsHeader, ...sessionRows] = sessionsRaw;
  const sessionIdIdx = sessionsHeader.indexOf('session_id');
  const sampleSessionIds = new Set(sessionRows.map((r) => r[sessionIdIdx]));
  check('sess_sample_001 is absent from 06_SESSIONS', !sampleSessionIds.has('sess_sample_001'));

  section('7. Google credential Git-ignore status');
  try {
    execFileSync(
      'git',
      ['check-ignore', '-v', 'apps/functions/config-private/google-service-account.json'],
      { stdio: 'pipe' },
    );
    check('Google credential file is ignored by Git', true);
  } catch {
    check('Google credential file is ignored by Git', false);
  }

  section('Summary');
  console.log(`  ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    console.error('\nM02-A PREFLIGHT FAILED — stopping with a sanitized blocker.');
    console.error('No Gate code or Admin password value was printed above.');
    process.exit(1);
  }

  console.log('\nM02-A PREFLIGHT PASSED. No access value was printed.');
}

main().catch((err) => {
  console.error('\nM02-A PREFLIGHT crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
