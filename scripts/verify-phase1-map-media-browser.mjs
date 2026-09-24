#!/usr/bin/env node
/**
 * Phase 1 items A/B: REAL browser verification that the media gateway
 * actually streams renderable bytes for the two registered map assets —
 * not merely that Drive metadata is reachable (that is what
 * `preflight-phase1-map-assets.mjs` already proved) and not merely that
 * jsdom-based unit tests assert a `src` attribute string (jsdom does not
 * fetch, decode, or play media at all).
 *
 * This launches a real headless Chromium (via Playwright, already
 * installed for `npm run test:e2e`) against a real local Express server
 * built from the actual `createApp()` — using the REAL Google Sheets/Drive
 * credential already present in this environment, not a fake client — and:
 *
 *   1. mints one real owner session row directly via the same
 *      `createOrReconcileSession` primitive the Gate-login handler calls
 *      internally AFTER a correct code is verified. This never reads,
 *      guesses, or uses Ahmed's real Gate code/digits — those are never
 *      touched by this script. The session row is idempotent (deterministic
 *      ID), so rerunning this script does not create a new row each time.
 *   2. loads a tiny same-origin HTML harness (served by the same server,
 *      not a cross-origin/data: page, so the Lax session cookie attaches
 *      normally) with a real <img> pointed at the real
 *      `/api/media/map_island_transparent` endpoint and a real <video>
 *      pointed at `/api/media/map_ocean_loop`.
 *   3. asserts the browser actually DECODED the image (`naturalWidth > 0`)
 *      and actually loaded playable video metadata (`readyState >= 1`,
 *      `videoWidth > 0`) — genuine rendering proof, not a string check.
 *   4. issues a real browser-side `fetch()` with a `Range` header against
 *      the ocean video and asserts a real `206 Partial Content` with a
 *      correct `Content-Range` — proving byte-range streaming works from
 *      an actual browser network stack, not just Node's `supertest`.
 *
 * Never prints the session ID (masked, consistent with the rest of this
 * codebase's session-ID handling) or any Drive file ID.
 */
import http from 'node:http';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const ASSET_IDS = { island: 'map_island_transparent', ocean: 'map_ocean_loop' };

function mask(id) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

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

async function main() {
  const gateway = getProductionGatewayOrNull();
  if (!gateway) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }

  // 1. Real owner session, minted directly — never via the real Gate code.
  // Timestamped so a rerun always mints a fresh, valid session rather than
  // silently reusing (and never refreshing the expiry of) an old run's now-
  // possibly-expired row — `createOrReconcileSession` is idempotent BY
  // attempt id.
  const sessionId = buildSessionId('gate', `phase1_ab_browser_media_verification_${Date.now()}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: 'phase1_verification',
    ip: '127.0.0.1',
    deviceId: 'phase1-browser-check',
    createdAt: now,
    expiresAt,
  });
  console.log(`Owner session minted: ${mask(sessionId)} (masked, real Gate code never touched)\n`);

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'vw_owner_session',
        value: sessionId,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    const harnessHtml = `<!doctype html><html><body>
      <img id="island" src="/api/media/${ASSET_IDS.island}?v=1" />
      <video id="ocean" muted playsinline src="/api/media/${ASSET_IDS.ocean}?v=1"></video>
    </body></html>`;
    await page.route('**/__phase1_harness', (route) =>
      route.fulfill({ body: harnessHtml, contentType: 'text/html' }),
    );
    await page.goto(`${origin}/__phase1_harness`);

    console.log('=== Real browser image rendering (map_island_transparent) ===');
    try {
      // The callback below runs inside the browser page context (injected by
      // Playwright), never in this Node process — `document` is real there.
      /* global document */
      await page.waitForFunction(
        () => {
          const img = document.getElementById('island');
          return img && img.complete && img.naturalWidth > 0;
        },
        { timeout: 15000 },
      );
      const naturalWidth = await page.$eval('#island', (el) => el.naturalWidth);
      check(
        'Browser decoded the image (naturalWidth > 0)',
        naturalWidth > 0,
        `naturalWidth=${naturalWidth}`,
      );
    } catch (err) {
      check('Browser decoded the image (naturalWidth > 0)', false, err.message);
    }

    console.log('\n=== Real browser video metadata (map_ocean_loop) ===');
    try {
      await page.waitForFunction(
        () => {
          const video = document.getElementById('ocean');
          return video && video.readyState >= 1 && video.videoWidth > 0;
        },
        { timeout: 20000 },
      );
      const { readyState, videoWidth, videoHeight } = await page.$eval('#ocean', (el) => ({
        readyState: el.readyState,
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
      }));
      check(
        'Browser loaded playable video metadata (readyState >= 1)',
        readyState >= 1,
        `readyState=${readyState}`,
      );
      check(
        'Video has real decoded dimensions',
        videoWidth > 0 && videoHeight > 0,
        `${videoWidth}x${videoHeight}`,
      );
    } catch (err) {
      check('Browser loaded playable video metadata (readyState >= 1)', false, err.message);
    }

    console.log('\n=== Real browser byte-range fetch (map_ocean_loop) ===');
    try {
      const result = await page.evaluate(async (assetId) => {
        const res = await fetch(`/api/media/${assetId}?v=1`, { headers: { Range: 'bytes=0-999' } });
        return {
          status: res.status,
          contentRange: res.headers.get('content-range'),
          contentLength: res.headers.get('content-length'),
        };
      }, ASSET_IDS.ocean);
      check(
        'Real browser Range request returns 206',
        result.status === 206,
        `status=${result.status}`,
      );
      check(
        'Content-Range header is present and well-formed',
        typeof result.contentRange === 'string' && result.contentRange.startsWith('bytes 0-999/'),
        `Content-Range=${result.contentRange}`,
      );
      check(
        'Content-Length matches the requested 1000-byte range',
        result.contentLength === '1000',
        `Content-Length=${result.contentLength}`,
      );
    } catch (err) {
      check('Real browser Range request returns 206', false, err.message);
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.error('\nPHASE 1 A/B BROWSER MEDIA VERIFICATION FAILED.');
    process.exit(1);
  }
  console.log(
    '\nPHASE 1 A/B BROWSER MEDIA VERIFICATION PASSED. No credential/session ID/Drive ID was printed.',
  );
}

main().catch((err) => {
  console.error('\nPhase 1 A/B browser media verification crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
