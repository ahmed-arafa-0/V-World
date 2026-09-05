#!/usr/bin/env node
/**
 * M02 live authentication verification. Manually invoked only
 * (npm run test:m02:live) — excluded from `npm run test`. Starts the real
 * Express app (`createApp()`, the real credential-backed production
 * gateway, real 05_ENTRY_LOGS/06_SESSIONS) on an ephemeral local port and
 * exercises it over real HTTP, the same way a browser would, so cookies,
 * rate limiting, and IP/device logging are proven against the actual
 * runtime — never a fake gateway.
 *
 * SECRETS: this script never prints a Gate code, Admin password, session
 * ID, or cookie value. The real Gate digits and Admin password are read
 * ONLY from optional environment variables Ahmed sets locally
 * (E2E_GATE_CODE, E2E_ADMIN_PASSWORD) — never hardcoded, never logged. When
 * they are not set, every check that would require them is reported SKIP
 * (not FAIL, and never fabricated as PASS) and the rest of the script
 * (failure paths, rate-limit boundary, idempotency, IP/device logging,
 * page-open) still runs fully against the real Sheet.
 *
 * Safety: only ever appends to 05_ENTRY_LOGS/06_SESSIONS (append-only audit
 * trail; nothing is deleted or edited), never writes to 02_USERS (the Gate
 * code / Admin password never change), and explicitly logs out (terminates)
 * every session this script creates before exiting.
 *
 * Robustness: every attempt/config read this script's own app makes to the
 * REAL Google Sheets API bypasses the cache by design (rate-limit/session
 * correctness over speed — see the M02-B2 checkpoint). That means this
 * script can itself occasionally trip Google's own short-window API quota,
 * which surfaces as a `SHEET_RATE_LIMITED`/`SHEET_UNAVAILABLE` app error —
 * coincidentally also an HTTP 429/503, easy to mistake for this app's own
 * intentional rate-limit response. `fetchApi()` below distinguishes the
 * two by response `code` and transparently retries only the former.
 */
import { createApp } from '../apps/functions/lib/app.js';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';

const ADMIN_USERNAME = 'admin_ahmed'; // a stable, non-secret identifier — confirmed present in M02-A preflight
const TEST_IP_PRIMARY = '203.0.113.210';
const TEST_IP_SECONDARY = '203.0.113.211';
const TRANSIENT_INFRA_CODES = new Set([
  'SHEET_RATE_LIMITED',
  'SHEET_UNAVAILABLE',
  'ACCESS_SERVICE_UNAVAILABLE',
]);

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

function skip(label, reason) {
  console.log(`  SKIP  ${label} — ${reason}`);
  skipCount++;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The one HTTP call site for the whole script. Pauses briefly before every
 * request (real Sheets reads are expensive and uncached by design) and
 * transparently retries — with a fresh request, never reusing a body that
 * might embed a one-shot attemptId — when the response is a transient
 * Google-infrastructure error rather than a genuine application answer.
 * Returns `{ res, body }`; `body` is `{}` if the response wasn't JSON.
 */
async function fetchApi(url, options = {}, { retries = 3, pacingMs = 1200 } = {}) {
  await sleep(pacingMs);
  let res;
  let body;
  for (let attempt = 1; attempt <= retries; attempt++) {
    res = await fetch(url, options);
    body = await res.json().catch(() => ({}));
    if (!TRANSIENT_INFRA_CODES.has(body?.code)) {
      return { res, body };
    }
    if (attempt < retries) {
      console.log(`  (retrying after a transient ${body.code} from the real Google Sheets API…)`);
      await sleep(3000 * attempt);
    }
  }
  return { res, body };
}

function jsonPost(body, extraHeaders) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function withCookie(cookie, extra = {}) {
  return { headers: { Cookie: cookie, ...extra } };
}

function extractCookie(response, name) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const entry of raw) {
    if (entry.startsWith(`${name}=`)) return entry.split(';')[0];
  }
  return null;
}

function cookieWasCleared(response, name) {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.some(
    (entry) => entry.startsWith(`${name}=`) && /Expires=Thu, 01 Jan 1970/i.test(entry),
  );
}

async function main() {
  section('1. Real Sheet connection and app startup');
  const client = createGoogleSheetsClientOrNull();
  check('Real Google credential is present and loads', client !== null);
  if (!client) {
    console.error(
      '\nBLOCKER: no Google credential available. Stopping — cannot run the live suite.',
    );
    process.exit(1);
  }

  const inspectionGateway = new SheetGateway(client, { ttlSeconds: 60 });
  const metadata = await inspectionGateway.getMetadata({ bypass: true });
  check('Sheets API metadata call succeeds', Boolean(metadata.title));

  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  Local HTTP server started on an ephemeral port (masked): 127.0.0.1:***`);

  // { kind: 'owner'|'admin', cookie } for any session not already explicitly
  // logged out inline below — a safety net for the `finally` block, not the
  // primary logout proof (that happens inline, as its own checked step).
  let sessionsToCleanUp = [];

  try {
    section('2. Page-open logging and idempotency');
    const pageOpenOpId = uniqueId('live_pageopen');
    const { body: firstPageOpenBody } = await fetchApi(
      `${baseUrl}/api/access/page-open`,
      jsonPost({ operationId: pageOpenOpId, deviceId: uniqueId('live_device'), route: '/' }),
    );
    check('First page-open returns ok:true with a logId', firstPageOpenBody.ok === true);

    const { body: secondPageOpenBody } = await fetchApi(
      `${baseUrl}/api/access/page-open`,
      jsonPost({ operationId: pageOpenOpId, deviceId: uniqueId('live_device'), route: '/' }),
    );
    check(
      'Retrying the same operationId returns the identical logId (idempotent, no duplicate row)',
      secondPageOpenBody.logId === firstPageOpenBody.logId,
    );

    section('3. Gate failure path (real Sheet, deliberately wrong code)');
    const gateFailDeviceId = uniqueId('live_device_gatefail');
    const { res: gateFailRes, body: gateFailBody } = await fetchApi(
      `${baseUrl}/api/auth/gate`,
      jsonPost(
        {
          digits: ['0', '0', '0', '0'],
          deviceId: gateFailDeviceId,
          attemptId: uniqueId('live_attempt_gatefail'),
        },
        { 'X-Forwarded-For': TEST_IP_PRIMARY },
      ),
    );
    check('A wrong Gate code returns HTTP 401', gateFailRes.status === 401);
    check(
      'The failure code is INVALID_GATE_CODE (no correct-code leak)',
      gateFailBody.code === 'INVALID_GATE_CODE',
    );
    check(
      'No session cookie is set on failure',
      extractCookie(gateFailRes, 'vw_owner_session') === null,
    );

    section('4. Admin failure path (real username, deliberately wrong password)');
    const { res: adminFailRes, body: adminFailBody } = await fetchApi(
      `${baseUrl}/api/auth/admin`,
      jsonPost(
        {
          username: ADMIN_USERNAME,
          password: `deliberately-wrong-${uniqueId('x')}`,
          deviceId: uniqueId('live_device_adminfail'),
          attemptId: uniqueId('live_attempt_adminfail'),
        },
        { 'X-Forwarded-For': TEST_IP_PRIMARY },
      ),
    );
    check('A wrong Admin password returns HTTP 401', adminFailRes.status === 401);
    check(
      'The failure code is INVALID_ADMIN_CREDENTIALS (no correct-password leak)',
      adminFailBody.code === 'INVALID_ADMIN_CREDENTIALS',
    );

    section('5. Protected /api/admin/schema-health rejects without a session');
    const { res: unauthSchemaHealth } = await fetchApi(`${baseUrl}/api/admin/schema-health`);
    check(
      '/api/admin/schema-health returns 401 SESSION_REQUIRED with no Admin cookie',
      unauthSchemaHealth.status === 401,
    );

    section('6. Gate rate-limit boundary (isolated test IP + device — never touches real usage)');
    const rlDeviceId = uniqueId('live_device_ratelimit');
    let lastGateRes;
    let lastGateBody;
    for (let i = 1; i <= 5; i++) {
      const { res, body } = await fetchApi(
        `${baseUrl}/api/auth/gate`,
        jsonPost(
          {
            digits: ['0', '0', '0', '0'],
            deviceId: rlDeviceId,
            attemptId: uniqueId(`live_rl_${i}`),
          },
          { 'X-Forwarded-For': TEST_IP_SECONDARY },
        ),
      );
      lastGateRes = res;
      lastGateBody = body;
      check(
        `Failure attempt ${i}/5 landed as a real 401`,
        res.status === 401,
        `actual status ${res.status}, code ${body.code}`,
      );
    }
    check(
      'The 5th consecutive failure is still a normal 401 (documented boundary choice)',
      lastGateRes.status === 401,
    );
    check(
      'remainingAttempts reaches 0 after the 5th failure',
      lastGateBody.rateLimit?.remainingAttempts === 0,
    );

    const { res: blockedGateRes, body: blockedGateBody } = await fetchApi(
      `${baseUrl}/api/auth/gate`,
      jsonPost(
        {
          digits: ['1', '1', '1', '1'],
          deviceId: rlDeviceId,
          attemptId: uniqueId('live_rl_blocked'),
        },
        { 'X-Forwarded-For': TEST_IP_SECONDARY },
      ),
    );
    check(
      'The 6th attempt is blocked with HTTP 429',
      blockedGateRes.status === 429 && blockedGateBody.code === 'RATE_LIMITED',
      `status=${blockedGateRes.status}, code=${blockedGateBody.code}`,
    );
    check(
      'The 429 response reports the accepted 10-second Gate cooldown',
      blockedGateBody.rateLimit?.cooldownSeconds === 10 &&
        typeof blockedGateBody.rateLimit?.retryAfterSeconds === 'number',
      `cooldownSeconds=${blockedGateBody.rateLimit?.cooldownSeconds}`,
    );

    section('7. Admin rate-limit boundary (isolated test IP + device)');
    const adminRlDeviceId = uniqueId('live_device_adminratelimit');
    let lastAdminRes;
    for (let i = 1; i <= 3; i++) {
      const { res, body } = await fetchApi(
        `${baseUrl}/api/auth/admin`,
        jsonPost(
          {
            username: ADMIN_USERNAME,
            password: `wrong-${uniqueId('x')}`,
            deviceId: adminRlDeviceId,
            attemptId: uniqueId(`live_admin_rl_${i}`),
          },
          { 'X-Forwarded-For': TEST_IP_SECONDARY },
        ),
      );
      lastAdminRes = res;
      check(
        `Failure attempt ${i}/3 landed as a real 401`,
        res.status === 401,
        `actual status ${res.status}, code ${body.code}`,
      );
    }
    check('The 3rd consecutive Admin failure is still a normal 401', lastAdminRes.status === 401);

    const { res: adminBlockedRes, body: adminBlockedBody } = await fetchApi(
      `${baseUrl}/api/auth/admin`,
      jsonPost(
        {
          username: ADMIN_USERNAME,
          password: `wrong-${uniqueId('x')}`,
          deviceId: adminRlDeviceId,
          attemptId: uniqueId('live_admin_rl_blocked'),
        },
        { 'X-Forwarded-For': TEST_IP_SECONDARY },
      ),
    );
    check(
      'The 4th Admin attempt is blocked with HTTP 429',
      adminBlockedRes.status === 429 && adminBlockedBody.code === 'RATE_LIMITED',
      `status=${adminBlockedRes.status}, code=${adminBlockedBody.code}`,
    );
    check(
      'The 429 response reports the accepted 30-second Admin cooldown',
      adminBlockedBody.rateLimit?.cooldownSeconds === 30,
      `cooldownSeconds=${adminBlockedBody.rateLimit?.cooldownSeconds}`,
    );

    section('8. IP and device logging (real Sheet rows)');
    await sleep(1000);
    const rawLogs = await inspectionGateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const [logHeader, ...logRows] = rawLogs;
    const ipIdx = logHeader.indexOf('ip_address');
    const deviceIdx = logHeader.indexOf('device_id');
    const eventIdx = logHeader.indexOf('event_type');
    const matchingFailureRow = logRows.find(
      (r) => r[deviceIdx] === gateFailDeviceId && r[eventIdx] === 'gate_failure',
    );
    check(
      'The gate_failure row logged the real observed IP, not a client-suppliable value',
      matchingFailureRow?.[ipIdx] === TEST_IP_PRIMARY,
    );
    check(
      'The gate_failure row logged the exact device ID this script sent',
      Boolean(matchingFailureRow),
    );

    section('9. Gate success path (requires E2E_GATE_CODE — optional, never printed)');
    const realGateCode = process.env.E2E_GATE_CODE;
    let ownerCookie = null;
    if (!realGateCode) {
      skip('Gate success login', 'E2E_GATE_CODE is not set in this environment');
      skip('Owner session resume', 'depends on a successful Gate login');
      skip('Owner heartbeat', 'depends on a successful Gate login');
    } else {
      const digits = realGateCode.trim().split('');
      check(
        'E2E_GATE_CODE is exactly 4 digits (sanity check only, value never logged)',
        digits.length === 4 && digits.every((d) => /^[0-9]$/.test(d)),
      );

      const { res: gateSuccessRes, body: gateSuccessBody } = await fetchApi(
        `${baseUrl}/api/auth/gate`,
        jsonPost({
          digits,
          deviceId: uniqueId('live_device_owner'),
          attemptId: uniqueId('live_attempt_owner'),
        }),
      );
      check('Gate login with the real code succeeds (HTTP 200)', gateSuccessRes.status === 200);
      check(
        'The success body never contains a sessionId field',
        !('sessionId' in (gateSuccessBody.session ?? {})),
      );

      ownerCookie = extractCookie(gateSuccessRes, 'vw_owner_session');
      check('An HttpOnly owner cookie was set', ownerCookie !== null);
      if (ownerCookie) {
        sessionsToCleanUp.push({ kind: 'owner', cookie: ownerCookie });

        const { res: resumeRes, body: resumeBody } = await fetchApi(
          `${baseUrl}/api/session/owner?resumeOperationId=${uniqueId('live_resume')}`,
          withCookie(ownerCookie),
        );
        check(
          'Owner session resume succeeds via the cookie',
          resumeRes.status === 200 && resumeBody.ok === true,
        );

        const beforeHeartbeat = await inspectionGateway.findByPrimaryKey(
          '06_SESSIONS',
          ownerCookie.split('=')[1],
          { bypass: true },
        );
        await sleep(1100);
        const { res: heartbeatRes, body: heartbeatBody } = await fetchApi(
          `${baseUrl}/api/session/owner/heartbeat`,
          { method: 'POST', ...withCookie(ownerCookie) },
        );
        check('Owner heartbeat succeeds', heartbeatRes.status === 200 && heartbeatBody.ok === true);
        check(
          'Heartbeat updates last_seen_at but never expires_at',
          heartbeatBody.session.expiresAt === beforeHeartbeat.row.raw.expires_at &&
            heartbeatBody.session.lastSeenAt !== beforeHeartbeat.row.raw.last_seen_at,
        );
      }
    }

    section('10. Admin success path (requires E2E_ADMIN_PASSWORD — optional, never printed)');
    const realAdminPassword = process.env.E2E_ADMIN_PASSWORD;
    let adminCookie = null;
    if (!realAdminPassword) {
      skip('Admin success login', 'E2E_ADMIN_PASSWORD is not set in this environment');
      skip('Admin session resume', 'depends on a successful Admin login');
      skip('Admin heartbeat', 'depends on a successful Admin login');
      skip(
        'Protected schema-health with a valid Admin session',
        'depends on a successful Admin login',
      );
    } else {
      const { res: adminSuccessRes } = await fetchApi(
        `${baseUrl}/api/auth/admin`,
        jsonPost({
          username: ADMIN_USERNAME,
          password: realAdminPassword,
          deviceId: uniqueId('live_device_admin'),
          attemptId: uniqueId('live_attempt_admin'),
        }),
      );
      check(
        'Admin login with the real password succeeds (HTTP 200)',
        adminSuccessRes.status === 200,
      );

      adminCookie = extractCookie(adminSuccessRes, 'vw_admin_session');
      check('An HttpOnly admin cookie was set', adminCookie !== null);
      if (adminCookie) {
        sessionsToCleanUp.push({ kind: 'admin', cookie: adminCookie });

        const { res: resumeRes } = await fetchApi(
          `${baseUrl}/api/session/admin?resumeOperationId=${uniqueId('live_resume_admin')}`,
          withCookie(adminCookie),
        );
        check('Admin session resume succeeds via the cookie', resumeRes.status === 200);

        const { res: heartbeatRes } = await fetchApi(`${baseUrl}/api/session/admin/heartbeat`, {
          method: 'POST',
          ...withCookie(adminCookie),
        });
        check('Admin heartbeat succeeds', heartbeatRes.status === 200);

        const { res: schemaHealthRes, body: schemaHealthBody } = await fetchApi(
          `${baseUrl}/api/admin/schema-health`,
          withCookie(adminCookie),
        );
        check(
          'Protected schema-health succeeds with a valid Admin session',
          schemaHealthRes.status === 200 && schemaHealthBody.summary?.expectedTabCount === 42,
        );
      }
    }

    section('11. Owner/Admin cookie separation and independent logout');
    if (ownerCookie && !adminCookie) {
      skip(
        'Owner/Admin cookie separation',
        'E2E_ADMIN_PASSWORD is not set — only the owner session exists',
      );
      const { res: logoutRes } = await fetchApi(`${baseUrl}/api/session/owner`, {
        method: 'DELETE',
        ...withCookie(ownerCookie),
      });
      check('Owner logout succeeds', logoutRes.status === 200);
      check('Logout clears the owner cookie', cookieWasCleared(logoutRes, 'vw_owner_session'));
      sessionsToCleanUp = sessionsToCleanUp.filter((s) => s.kind !== 'owner');
    } else if (adminCookie && !ownerCookie) {
      skip(
        'Owner/Admin cookie separation',
        'E2E_GATE_CODE is not set — only the admin session exists',
      );
      const { res: logoutRes } = await fetchApi(`${baseUrl}/api/session/admin`, {
        method: 'DELETE',
        ...withCookie(adminCookie),
      });
      check('Admin logout succeeds', logoutRes.status === 200);
      check('Logout clears the admin cookie', cookieWasCleared(logoutRes, 'vw_admin_session'));
      sessionsToCleanUp = sessionsToCleanUp.filter((s) => s.kind !== 'admin');
    } else if (!ownerCookie && !adminCookie) {
      skip(
        'Owner/Admin cookie separation',
        'requires both E2E_GATE_CODE and E2E_ADMIN_PASSWORD to establish both sessions at once',
      );
    } else {
      // Log out the owner session only, then prove the admin session is untouched.
      const { res: ownerLogoutRes } = await fetchApi(`${baseUrl}/api/session/owner`, {
        method: 'DELETE',
        ...withCookie(ownerCookie),
      });
      check('Owner logout succeeds', ownerLogoutRes.status === 200);
      check(
        'Logout clears only the owner cookie',
        cookieWasCleared(ownerLogoutRes, 'vw_owner_session'),
      );
      sessionsToCleanUp = sessionsToCleanUp.filter((s) => s.kind !== 'owner');

      const { res: afterOwnerLogoutResume, body: afterOwnerLogoutBody } = await fetchApi(
        `${baseUrl}/api/session/owner`,
        withCookie(ownerCookie),
      );
      check(
        'The now-terminated owner session is rejected on the next request',
        afterOwnerLogoutResume.status === 401 && afterOwnerLogoutBody.code === 'SESSION_TERMINATED',
      );

      const { res: adminStillActiveRes } = await fetchApi(
        `${baseUrl}/api/session/admin`,
        withCookie(adminCookie),
      );
      check(
        'Logging out the owner session does not affect the admin session',
        adminStillActiveRes.status === 200,
      );

      const { res: adminLogoutRes } = await fetchApi(`${baseUrl}/api/session/admin`, {
        method: 'DELETE',
        ...withCookie(adminCookie),
      });
      check('Admin logout succeeds', adminLogoutRes.status === 200);
      check(
        'Logout clears only the admin cookie',
        cookieWasCleared(adminLogoutRes, 'vw_admin_session'),
      );
      sessionsToCleanUp = sessionsToCleanUp.filter((s) => s.kind !== 'admin');
    }
  } finally {
    section('Cleanup — terminating any session this script left active');
    for (const { kind, cookie } of sessionsToCleanUp) {
      try {
        await fetch(`${baseUrl}/api/session/${kind}`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        });
        console.log(`  Terminated a leftover ${kind} session created by this script.`);
      } catch {
        console.error(
          `  WARNING: failed to terminate a leftover ${kind} session — check manually.`,
        );
      }
    }
    await new Promise((resolve) => server.close(resolve));
  }

  section('Summary');
  console.log(`  ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log(
    '  No Gate code, Admin password, session ID, or cookie value was printed anywhere above.',
  );

  if (failCount > 0) {
    console.error('\nM02 LIVE AUTH VERIFICATION FAILED.');
    process.exit(1);
  }

  console.log('\nM02 LIVE AUTH VERIFICATION PASSED.');
}

main().catch((err) => {
  console.error('\nM02 LIVE AUTH VERIFICATION crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
