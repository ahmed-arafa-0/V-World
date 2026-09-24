#!/usr/bin/env node
/* global document, window */
/**
 * Phase 1 items A–G, plus item H (voice-over removal, 2026-09-17): the
 * strongest available real-browser verification — the REAL built React app
 * (apps/web/dist, from `vite build`) served same-origin alongside the REAL
 * backend (`createApp()`, real Sheet/Drive credential), with a real
 * headless Chromium navigating to it with a minted (never Gate-code-derived)
 * owner session cookie already set. This closes the specific gap the
 * Phase 1-B addendum (§9.3) flagged as still open: "the actual
 * MapCompositionPreview/ContentRuntimeLab/NarrativeRuntimeLab React
 * components, rendered inside the real app shell behind the real
 * Gate-authenticated UI flow, in a real (non-jsdom) browser" — this script
 * is exactly that, except the session is resumed (via `GET
 * /api/session/owner`, the same code path a real refresh uses) rather than
 * typed through the Gate's four dials, since Ahmed's real digits are never
 * read, guessed, or used by this session. Since item H, this also asserts
 * text-only narration progression and zero narration-audio network
 * requests, both before and after Gate authentication.
 *
 * Run `npm run build` first (or use `npm run verify:phase1:full-app`,
 * which does it for you) so `apps/web/dist` is current.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(dirname, '..', 'apps', 'web', 'dist');
const evidenceDir = path.join(dirname, '..', 'docs', 'reports', 'PHASE1');

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
  if (!fs.existsSync(path.join(webDist, 'index.html'))) {
    console.error(`BLOCKER: ${webDist} has no index.html — run "npm run build" first.`);
    process.exit(1);
  }
  fs.mkdirSync(evidenceDir, { recursive: true });

  const gateway = getProductionGatewayOrNull();
  if (!gateway) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }

  // A fresh, timestamped attempt id every run — `createOrReconcileSession`
  // is idempotent BY attempt id (`appendIfAbsent`), so a fixed constant here
  // would silently reuse (and never refresh the expiry of) whatever session
  // row an earlier run already created, which starts failing with a real
  // 401 once enough wall-clock time passes for that old row to expire.
  const sessionId = buildSessionId(
    'gate',
    `phase1_abcef_full_app_browser_verification_${Date.now()}`,
  );
  const verificationUserId = `phase1_full_app_${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: verificationUserId,
    ip: '127.0.0.1',
    deviceId: 'phase1-full-app-browser-check',
    createdAt: now,
    expiresAt,
  });
  console.log(`Owner session minted: ${mask(sessionId)} (masked, real Gate code never touched)\n`);

  // One real Express app serving the REAL backend AND the REAL built
  // frontend from the same origin — exactly how Firebase Hosting +
  // Functions serve the real deployment (a single-origin SPA + API).
  // Static MUST come first: `createApp()`'s own internal catch-all 404
  // handler would otherwise intercept every request (including "/" and
  // "/assets/*.js") before it ever reached the static file server, since
  // mounting a sub-app with `app.use()` gives it a chance to fully handle
  // (and end) any request regardless of path. Static calls `next()` for
  // anything that isn't a real file on disk (e.g. every `/api/*` route),
  // so `/api/*` still reaches the backend correctly below.
  const backend = createApp();
  const app = express();
  app.use(express.static(webDist));
  app.use(backend);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  try {
    console.log('=== Real, unauthenticated pre-Gate opening sequence (public endpoint) ===');
    const anonContext = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const anonPage = await anonContext.newPage();
    // Narrows to media requests that look like a voiceover-style asset id
    // (the historical `vo_*`/`asset_vo_*` naming used throughout
    // 16_VOICEOVER/10_ASSETS) rather than every `/api/media/` request —
    // the Beach scene and future map/music assets legitimately use that
    // same gateway for non-narration media and must not trip this check.
    const isVoiceoverLikeMediaUrl = (url) => /\/api\/media\/(asset_)?vo_/i.test(url);
    const anonMediaRequests = [];
    anonPage.on('request', (req) => {
      if (isVoiceoverLikeMediaUrl(req.url())) anonMediaRequests.push(req.url());
    });
    try {
      await anonPage.goto(origin, { waitUntil: 'networkidle' });
      await anonPage.waitForSelector('[data-testid="pre-gate-sequence"]', { timeout: 10000 });
      check('An anonymous visitor (no cookie at all) sees the pre-Gate sequence', true);

      await anonPage.click('[data-testid="pre-gate-continue"]');
      await anonPage.waitForSelector('[data-testid="pre-gate-title"]', { timeout: 5000 });
      await anonPage.click('[data-testid="pre-gate-continue"]');
      await anonPage.waitForSelector('[data-testid="dialogue-text-line"]', { timeout: 5000 });
      const captionText = await anonPage.textContent('[data-testid="dialogue-text-line"]');
      check(
        'Real narration text from the live Sheet renders with no owner session (text-only, per item H)',
        typeof captionText === 'string' && captionText.trim().length > 0,
        `text="${captionText}"`,
      );
      const preGateContinueLabel = await anonPage.textContent('[data-testid="pre-gate-continue"]');
      check(
        'The pre-Gate Continue action is localized (never empty/raw), pacing text progression',
        typeof preGateContinueLabel === 'string' && preGateContinueLabel.trim().length > 0,
        `label="${preGateContinueLabel}"`,
      );
      await anonPage.click('[data-testid="pre-gate-continue"]');
      await anonPage.waitForSelector('[data-testid="var-reveal-placeholder"]', { timeout: 5000 });
      await anonPage.click('[data-testid="pre-gate-continue"]');
      await anonPage.waitForSelector('[role="group"]', { timeout: 10000 });
      check('Continuing through unseen → reveal reaches the real dial form', true);
      const mobileGateLayout = await anonPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        dialCount: document.querySelectorAll('[role="spinbutton"]').length,
      }));
      check(
        'Mobile Gate exposes four operable dials without horizontal overflow',
        mobileGateLayout.dialCount === 4 &&
          mobileGateLayout.scrollWidth <= mobileGateLayout.viewportWidth + 1,
        JSON.stringify(mobileGateLayout),
      );
      await anonPage.screenshot({
        path: path.join(evidenceDir, 'gate-mobile.png'),
        fullPage: true,
      });
      check(
        'Zero voiceover-style /api/media/ requests during the entire pre-Gate narration sequence (per item H)',
        anonMediaRequests.length === 0,
        anonMediaRequests.join(', '),
      );
      const anonAudioElementCount = await anonPage.locator('audio').count();
      check(
        'Zero <audio> elements in the pre-Gate sequence (narration is text-only, per item H)',
        anonAudioElementCount === 0,
        `count=${anonAudioElementCount}`,
      );
    } catch (err) {
      check('Real unauthenticated pre-Gate sequence works end to end', false, err.message);
    }
    await anonContext.close();

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
    const consoleErrors = [];
    const knownRetryableMutationErrors = [];
    const voiceoverLikeMediaRequests = [];
    page.on('request', (req) => {
      if (isVoiceoverLikeMediaUrl(req.url())) voiceoverLikeMediaRequests.push(req.url());
    });
    // Since item H (voice-over removal, 2026-09-17), narration/dialogue is
    // text-only and never requests `/api/media/` at all — a missing-audio
    // 404 was expected pre-item-H (a live placeholder Drive ID for
    // `dlg_gate_01`, see the now-retired docs/content/PHASE_1_VOICEOVER_CUES.md
    // §1a) but is no longer possible, so it is treated as a genuine
    // unexpected error rather than a known/carved-out case.
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const url = msg.location()?.url;
      if (
        /Failed to load resource.*429/.test(text) &&
        (url ?? '').includes('/api/world/beach/shell')
      ) {
        knownRetryableMutationErrors.push(`${text} (${url})`);
      } else {
        consoleErrors.push(`${text}${url ? ` (${url})` : ''}`);
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log('=== Real app boot with a resumed (not Gate-typed) owner session ===');
    await page.goto(origin, { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('text=Access granted', { timeout: 15000 });
      check('The real app resumed the session and skipped the Gate dial screen', true);
    } catch (err) {
      check(
        'The real app resumed the session and skipped the Gate dial screen',
        false,
        err.message,
      );
    }

    console.log('\n=== Real FirstOpeningFlow: resumed session follows Cove arrival → naming ===');
    try {
      await page.waitForSelector('[data-testid="beach-arrival"]', { timeout: 10000 });
      check('A resumed session with no checkpoint starts at the Cove arrival beat', true);
      await page.click('[data-testid="beach-arrival-continue"]');
      await page.waitForSelector('[data-testid="naming-prompt"]', { timeout: 10000 });
      check('NamingPrompt rendered after the Cove arrival beat', true);

      await page.fill('[data-testid="naming-name-input"]', 'Phase1VerificationName');
      await page.check('[data-testid="naming-gender-female"]');
      await page.click('[data-testid="naming-submit"]');
      await page.waitForSelector('[data-testid="collar-name"]', { timeout: 10000 });
      check('The saved name appears on the collar confirmation', true);
      await page.click('[data-testid="naming-continue"]');
      await page.waitForSelector('[data-testid="scene-journey"]', { timeout: 10000 });
      check('Submitting a real name via the real character API advances to the Beach', true);
    } catch (err) {
      check('Real FirstOpeningFlow naming step works end to end', false, err.message);
    }

    console.log(
      '\n=== Real Content Runtime Lab, Narrative Runtime Lab, and Map Preview all render ===',
    );
    try {
      await page.waitForSelector('[data-testid="content-runtime-lab"]', { timeout: 10000 });
      check('ContentRuntimeLab rendered', true);
    } catch (err) {
      check('ContentRuntimeLab rendered', false, err.message);
    }
    try {
      await page.waitForSelector('[data-testid="narrative-runtime-lab"]', { timeout: 10000 });
      check('NarrativeRuntimeLab rendered (text-only, per item H)', true);
    } catch (err) {
      check('NarrativeRuntimeLab rendered (text-only, per item H)', false, err.message);
    }
    const mapPreviewCount = await page.locator('[data-testid="map-composition-preview"]').count();
    const mapPreviewUnavailableCount = await page
      .locator('[data-testid="map-preview-unavailable"]')
      .count();
    check(
      'The developer-only Map preview is absent from the production frontend build',
      mapPreviewCount === 0 && mapPreviewUnavailableCount === 0,
      `preview=${mapPreviewCount}, unavailable=${mapPreviewUnavailableCount}`,
    );

    console.log('\n=== Real narration text against real live Sheet content, all five locales ===');
    try {
      const captionText = await page.textContent(
        '[data-testid^="narrative-demo-"] [data-testid="dialogue-text-line"]',
      );
      check(
        'At least one real dialogue line rendered with non-empty text',
        typeof captionText === 'string' && captionText.trim().length > 0,
        `text="${captionText}"`,
      );
      for (const localeId of ['en', 'ar-EG', 'it', 'el', 'fr']) {
        await page.click(`[data-testid="narrative-locale-button-${localeId}"]`);
        const localizedText = await page.textContent(
          '[data-testid^="narrative-demo-"] [data-testid="dialogue-text-line"]',
        );
        check(
          `Narrative lab renders non-empty text for locale "${localeId}"`,
          typeof localizedText === 'string' && localizedText.trim().length > 0,
          `text="${localizedText}"`,
        );
      }
      const labDirection = await page.getAttribute('[data-testid="narrative-runtime-lab"]', 'dir');
      await page.click('[data-testid="narrative-locale-button-ar-EG"]');
      const rtlDirection = await page.getAttribute('[data-testid="narrative-runtime-lab"]', 'dir');
      check(
        'Switching to Arabic sets the lab direction to RTL (LTR before it)',
        labDirection === 'ltr' && rtlDirection === 'rtl',
        `before="${labDirection}", after="${rtlDirection}"`,
      );
    } catch (err) {
      check('Real narration text renders correctly across all five locales', false, err.message);
    }

    console.log('\n=== Real M05 scene engine (SceneJourney) in an actual browser ===');
    try {
      await page.waitForSelector('[data-testid="scene-stage-beach_focus"]', { timeout: 10000 });
      check('SceneJourney renders the first authored node (beach_focus)', true);
      await page.screenshot({
        path: path.join(evidenceDir, 'beach-desktop.png'),
        fullPage: true,
      });
    } catch (err) {
      check('SceneJourney renders the first authored node (beach_focus)', false, err.message);
    }
    try {
      await page.click('[data-testid="marker-shell"]');
      const rewardNote = await page.textContent('[data-testid="marker-activated-note"]');
      const queuedMutationCount = await page.evaluate((userId) => {
        const raw = window.localStorage.getItem(
          `vw_player_pending_v1:${encodeURIComponent(userId)}`,
        );
        return raw ? JSON.parse(raw).length : 0;
      }, verificationUserId);
      check(
        'The Sheet-configured Beach key award is applied or safely queued with its idempotent transaction',
        typeof rewardNote === 'string' &&
          (/key_shell|duplicate_transaction|daily_cap_reached/.test(rewardNote) ||
            (/queued for safe retry/.test(rewardNote) && queuedMutationCount === 1)),
        `note=${rewardNote}, queued=${queuedMutationCount}`,
      );
    } catch (err) {
      check(
        'The Sheet-configured Beach key award is applied or safely queued with its idempotent transaction',
        false,
        err.message,
      );
    }
    try {
      const stepCount = await page.locator('[data-testid="step"]').count();
      check(
        'The steps node is not yet visible (0 steps at beach_focus)',
        stepCount === 0,
        `stepCount=${stepCount}`,
      );
      await page.click('[data-testid="walk-forward"]');
      await page.waitForSelector('[data-testid="scene-stage-beach_steps"]', { timeout: 10000 });
      const stepsAfter = await page.locator('[data-testid="step"]').count();
      check(
        'Walking forward reaches beach_steps with exactly three real rendered step elements',
        stepsAfter === 3,
        `stepCount=${stepsAfter}`,
      );
    } catch (err) {
      check(
        'Walking forward reaches beach_steps with exactly three real rendered step elements',
        false,
        err.message,
      );
    }
    try {
      // A production build bakes import.meta.env.DEV=false into the
      // bundle regardless of the serving process's own NODE_ENV — the
      // debug overlay must not appear here since forceDebugOverlay is
      // unset in the real app usage (GatePage.tsx never passes it).
      const debugOverlayCount = await page.locator('[data-testid="scene-debug-overlay"]').count();
      check(
        'The scene debug overlay is not shown in a production build (disabled in production)',
        debugOverlayCount === 0,
        `count=${debugOverlayCount}`,
      );
    } catch (err) {
      check('The scene debug overlay is not shown in a production build', false, err.message);
    }

    console.log('\n=== No uncaught browser console/page errors during the whole flow ===');
    check(
      'Zero unexpected console/page errors',
      consoleErrors.length === 0,
      consoleErrors.join(' | '),
    );
    check(
      'Zero voiceover-style /api/media/ requests during the authenticated flow (no narration audio, per item H)',
      voiceoverLikeMediaRequests.length === 0,
      voiceoverLikeMediaRequests.join(', '),
    );
    const audioElementCount = await page.locator('audio').count();
    check(
      'Zero <audio> elements anywhere in the authenticated app (narration is text-only, per item H)',
      audioElementCount === 0,
      `count=${audioElementCount}`,
    );
    if (knownRetryableMutationErrors.length > 0) {
      console.log(
        `  INFO  ${knownRetryableMutationErrors.length} transient key-award 429(s) were handled by the pending-mutation queue and did not block the story.`,
      );
    }

    console.log('\n=== Mobile Chromium viewport (resized authenticated Beach) ===');
    await page.setViewportSize({ width: 393, height: 852 });
    const mobileSceneLayout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      hasScene: Boolean(document.querySelector('[data-testid="scene-journey"]')),
    }));
    check(
      'Mobile Beach scene remains usable without horizontal overflow',
      mobileSceneLayout.hasScene &&
        mobileSceneLayout.scrollWidth <= mobileSceneLayout.viewportWidth + 1,
      JSON.stringify(mobileSceneLayout),
    );
    await page.screenshot({
      path: path.join(evidenceDir, 'beach-mobile.png'),
      fullPage: true,
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.error('\nPHASE 1 A–G FULL-APP BROWSER VERIFICATION FAILED.');
    process.exit(1);
  }
  console.log('\nPHASE 1 A–G FULL-APP BROWSER VERIFICATION PASSED.');
}

main().catch((err) => {
  console.error('\nPhase 1 full-app browser verification crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
