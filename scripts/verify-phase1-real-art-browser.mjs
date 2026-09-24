#!/usr/bin/env node
/* global document, window */
/**
 * Live verification of Ahmed's real Phase 1 artwork now that it's
 * registered in 10_ASSETS (see scripts/seed-phase1-scene-assets.mjs): the
 * REAL built React app served alongside the REAL backend (real Sheet +
 * read-only Drive credential), a real headless Chromium, both desktop and
 * mobile viewports. Confirms real photos replace placeholders with no
 * duplicated CSS layer left behind, the public pre-Gate art renders with
 * no session at all, the walking companion appears in-scene, and captures
 * screenshots at every beat for visual hotspot/crop/alignment review.
 *
 * Run `npm run build` first so apps/web/dist is current.
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
const evidenceDir = path.join(dirname, '..', 'docs', 'reports', 'PHASE1_REAL_ART');

/**
 * Waits for every currently-rendered `<img>` to finish loading AND report a
 * non-zero natural size — a `.count() === 1` DOM check alone proves the
 * element exists, not that it actually painted visible pixels (an image
 * mid-load, or one whose src 404s, still exists in the DOM). Screenshots
 * taken without this wait are not trustworthy evidence either way.
 */
async function waitForImagesLoaded(page, timeoutMs = 20000) {
  await page.waitForFunction(
    () =>
      Array.from(document.images).every(
        (img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
      ),
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * True only if the element itself (or a descendant of it, e.g. the real
 * `<img>` inside a `<picture>`) is the actual topmost paint target at its
 * own center point — catches a z-index/stacking bug that hides a correctly
 * loaded, correctly sized image behind something else, which
 * `naturalWidth > 0` alone cannot detect (see the real Gate-background bug
 * this caught: `.page` had `position: relative` without its own stacking
 * context, so `z-index: -1` escaped behind the whole app shell).
 */
async function isTopmostAtOwnCenter(page, selector) {
  return isTopmostAtFraction(page, selector, 0.5, 0.5);
}

/**
 * Same idea as `isTopmostAtOwnCenter`, but sampled at an arbitrary point
 * within the element's own box (`xFraction`/`yFraction` in [0, 1]) — needed
 * for a full-bleed background whose exact center is legitimately covered by
 * real centered foreground UI (e.g. the Gate's dial form), where the center
 * point failing this check would be a false positive for "hidden," not a
 * real stacking bug. A corner is a safe sample point for those.
 */
async function isTopmostAtFraction(page, selector, xFraction, yFraction) {
  return page.evaluate(
    ({ sel, xFraction, yFraction }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width * xFraction;
      const y = rect.top + rect.height * yFraction;
      const topElement = document.elementFromPoint(x, y);
      return topElement === el || (topElement != null && el.contains(topElement));
    },
    { sel: selector, xFraction, yFraction },
  );
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

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  // A distinct session AND user per viewport pass — reusing one across both
  // would let the second pass's FirstOpeningFlow correctly resume past
  // Cove arrival/naming (already checkpointed by the first pass) instead of
  // showing them again, which is real, intended resume behavior but not
  // what this script means to exercise twice.
  async function mintSession(label) {
    const sessionId = buildSessionId('gate', `phase1_real_art_verification_${label}_${Date.now()}`);
    const userId = `phase1_real_art_${label}_${Date.now()}`;
    await createOrReconcileSession(gateway, {
      sessionId,
      userId,
      ip: '127.0.0.1',
      deviceId: `phase1-real-art-browser-check-${label}`,
      createdAt: now,
      expiresAt,
    });
    return sessionId;
  }
  console.log(
    'Owner sessions will be minted per viewport (masked, real Gate code never touched).\n',
  );

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
    for (const viewportName of ['desktop', 'mobile']) {
      const viewport =
        viewportName === 'desktop' ? { width: 1280, height: 800 } : { width: 393, height: 852 };

      console.log(
        `\n=== ${viewportName.toUpperCase()} — public pre-Gate art (no session at all) ===`,
      );
      const anonContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const anonPage = await anonContext.newPage();
      const anonConsoleErrors = [];
      anonPage.on('pageerror', (err) => anonConsoleErrors.push(String(err)));
      try {
        await anonPage.goto(origin, { waitUntil: 'networkidle' });
        await anonPage.waitForSelector('[data-testid="pre-gate-sequence"]', { timeout: 10000 });
        await anonPage.click('[data-testid="pre-gate-continue"]'); // opening -> title
        await anonPage.click('[data-testid="pre-gate-continue"]'); // title -> unseen
        await anonPage.click('[data-testid="pre-gate-continue"]'); // unseen -> reveal
        await anonPage.waitForSelector('[data-testid="var-reveal-placeholder"]', {
          timeout: 5000,
        });
        await waitForImagesLoaded(anonPage);
        const revealImage = anonPage.locator('[data-testid="var-reveal-image"]');
        const revealImageNaturalWidth = (await revealImage.count())
          ? await revealImage.evaluate((el) => el.naturalWidth)
          : 0;
        const revealImageOnTop = await isTopmostAtOwnCenter(
          anonPage,
          '[data-testid="var-reveal-image"]',
        );
        check(
          'The real VAR/companion reveal image renders pre-Gate with visible pixels, not just a DOM node',
          revealImageNaturalWidth > 0 && revealImageOnTop,
          `naturalWidth=${revealImageNaturalWidth}, onTop=${revealImageOnTop}`,
        );
        await anonPage.click('[data-testid="pre-gate-continue"]'); // reveal -> dial screen
        await anonPage.waitForSelector('[role="group"]', { timeout: 10000 });
        await waitForImagesLoaded(anonPage);
        const gateBg = anonPage.locator('[data-testid="gate-closed-background"]');
        const gateBgNaturalWidth = (await gateBg.count())
          ? await gateBg.evaluate((el) => el.naturalWidth)
          : 0;
        // Sampled near a corner, not dead center — the dial form is
        // legitimately centered on top of this full-bleed background, so
        // the exact center point failing this check would be a false
        // positive, not evidence of a real stacking bug.
        const gateBgOnTop = await isTopmostAtFraction(
          anonPage,
          '[data-testid="gate-closed-background"]',
          0.05,
          0.05,
        );
        check(
          'The real closed-Gate background renders on the dial screen with visible pixels, not just a DOM node',
          gateBgNaturalWidth > 0 && gateBgOnTop,
          `naturalWidth=${gateBgNaturalWidth}, onTop=${gateBgOnTop}`,
        );
        await anonPage.screenshot({
          path: path.join(evidenceDir, `gate-closed-${viewportName}.png`),
          fullPage: true,
        });
      } catch (err) {
        check(`${viewportName}: public pre-Gate real art renders end to end`, false, err.message);
      }
      check(
        `${viewportName}: zero uncaught page errors during the pre-Gate sequence`,
        anonConsoleErrors.length === 0,
        anonConsoleErrors.join(' | '),
      );
      await anonContext.close();

      console.log(`\n=== ${viewportName.toUpperCase()} — authenticated First Opening Flow ===`);
      const sessionId = await mintSession(viewportName);
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
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
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=Access granted', { timeout: 15000 });

        // A fresh verification user with no prior progress starts at Cove
        // arrival (beach_arrival), not the one-time doors transition
        // (justAuthenticated is only true right after a real Gate submit in
        // the same tab) — this mirrors how a resumed session actually
        // behaves, and still exercises the real beach_focus_scene photo via
        // BeachArrival.
        await page.waitForSelector('[data-testid="beach-arrival"]', { timeout: 10000 });
        const beachArrivalStage = page.locator(
          '[data-testid="scene-stage-beach_focus"][data-placeholder="false"]',
        );
        check(
          `${viewportName}: BeachArrival shows the real beach_focus_scene photo (placeholder=false)`,
          (await beachArrivalStage.count()) === 1,
        );
        await page.screenshot({
          path: path.join(evidenceDir, `beach-arrival-${viewportName}.png`),
          fullPage: true,
        });

        await page.click('[data-testid="beach-arrival-continue"]');
        await page.waitForSelector('[data-testid="naming-prompt"]', { timeout: 10000 });
        await waitForImagesLoaded(page);
        const noCollarSel = '[data-testid="naming-character-no-collar"]';
        const noCollarWidth = (await page.locator(noCollarSel).count())
          ? await page.locator(noCollarSel).evaluate((el) => el.naturalWidth)
          : 0;
        const noCollarOnTop = await isTopmostAtOwnCenter(page, noCollarSel);
        check(
          `${viewportName}: NamingPrompt shows the real no-collar companion before saving, with visible pixels`,
          noCollarWidth > 0 && noCollarOnTop,
          `naturalWidth=${noCollarWidth}, onTop=${noCollarOnTop}`,
        );
        await page.screenshot({
          path: path.join(evidenceDir, `naming-before-${viewportName}.png`),
          fullPage: true,
        });

        await page.fill('[data-testid="naming-name-input"]', 'RealArtVerification');
        await page.check('[data-testid="naming-gender-female"]');
        await page.click('[data-testid="naming-submit"]');
        await page.waitForSelector('[data-testid="collar-name"]', { timeout: 10000 });
        await waitForImagesLoaded(page);
        const collarSel = '[data-testid="naming-character-collar"]';
        const collarWidth = (await page.locator(collarSel).count())
          ? await page.locator(collarSel).evaluate((el) => el.naturalWidth)
          : 0;
        const collarOnTop = await isTopmostAtOwnCenter(page, collarSel);
        check(
          `${viewportName}: NamingPrompt shows the real collared companion after saving, with visible pixels`,
          collarWidth > 0 && collarOnTop,
          `naturalWidth=${collarWidth}, onTop=${collarOnTop}`,
        );
        await page.screenshot({
          path: path.join(evidenceDir, `naming-after-${viewportName}.png`),
          fullPage: true,
        });

        await page.click('[data-testid="naming-continue"]');
        await page.waitForSelector('[data-testid="scene-journey"]', { timeout: 10000 });

        const nodeIds = ['beach_focus', 'beach_steps', 'steps_church_approach', 'church_focus'];
        for (let i = 0; i < nodeIds.length; i++) {
          const nodeId = nodeIds[i];
          await page.waitForSelector(`[data-testid="scene-stage-${nodeId}"]`, { timeout: 10000 });
          const stage = page.locator(`[data-testid="scene-stage-${nodeId}"]`);
          const placeholderAttr = await stage.getAttribute('data-placeholder');
          check(
            `${viewportName}: node "${nodeId}" shows real art (data-placeholder=false), not a placeholder`,
            placeholderAttr === 'false',
            `data-placeholder="${placeholderAttr}"`,
          );

          await waitForImagesLoaded(page);

          // No duplicated art: the real photo must be present with decoded
          // pixels, and every placeholder layer (including occluders — a
          // placeholder occluder is a full-stage opaque color block, and an
          // earlier run of this exact script caught it completely hiding
          // the real photo underneath) must be gone. `naturalWidth` proves
          // real image bytes decoded; the final visual confirmation is the
          // screenshot itself (`.backgroundPhoto` is deliberately oversized
          // — `inset: -5% -15%`, clipped by `.stage`'s `overflow: hidden`
          // for a parallax margin — which makes a point-sampled occlusion
          // check against its own unclipped bounding box unreliable here).
          const photoSel = `[data-testid="scene-photo-${nodeId}"]`;
          const photoWidth = (await page.locator(photoSel).count())
            ? await page.locator(photoSel).evaluate((el) => el.naturalWidth)
            : 0;
          const skyLayerCount = await page
            .locator(`[data-testid="scene-layer-${nodeId}-sky"]`)
            .count();
          check(
            `${viewportName}: node "${nodeId}" real photo present with decoded pixels (see screenshot for final visual confirmation)`,
            photoWidth > 0,
            `naturalWidth=${photoWidth}`,
          );
          check(
            `${viewportName}: node "${nodeId}" placeholder "sky" CSS layer is gone (no duplicated art)`,
            skyLayerCount === 0,
            `skyLayerCount=${skyLayerCount}`,
          );
          const badgeCount = await page.locator('text=DEV PLACEHOLDER —').count();
          check(
            `${viewportName}: node "${nodeId}" the "DEV PLACEHOLDER" corner badge is gone`,
            badgeCount === 0,
          );

          // `.companion` is deliberately `pointer-events: none` (a
          // decorative overlay, never a click target), which makes it
          // invisible to `elementFromPoint`-based occlusion checks by
          // design — `naturalWidth` + the screenshot are the real proof
          // here, not a point-sample hit-test.
          const companionSel = '[data-testid="scene-companion"]';
          const companionWidth = (await page.locator(companionSel).count())
            ? await page.locator(companionSel).evaluate((el) => el.naturalWidth)
            : 0;
          check(
            `${viewportName}: node "${nodeId}" real walking companion overlay is present with decoded pixels (see screenshot for final visual confirmation)`,
            companionWidth > 0,
            `naturalWidth=${companionWidth}`,
          );

          if (nodeId === 'beach_steps' || nodeId === 'steps_church_approach') {
            // Scoped to THIS node's own stage — the previous node can still
            // be mounted mid-transition (fadeOut, cleared after 600ms) and
            // would otherwise double-count a page-wide "step" query.
            const stepCount = await stage.locator('[data-testid="step"]').count();
            check(
              `${viewportName}: node "${nodeId}" still shows exactly three literal step elements`,
              stepCount === 3,
              `stepCount=${stepCount}`,
            );
          }

          await page.screenshot({
            path: path.join(evidenceDir, `${nodeId}-${viewportName}.png`),
            fullPage: true,
          });

          if (i < nodeIds.length - 1) {
            await page.click('[data-testid="walk-forward"]');
            // Lets the previous node's 600ms fadeOut fully clear before the
            // next iteration's checks/screenshot, so nothing overlaps.
            await page.waitForTimeout(700);
          }
        }

        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        check(
          `${viewportName}: no horizontal overflow across the full illustrated journey`,
          layout.scrollWidth <= layout.viewportWidth + 1,
          JSON.stringify(layout),
        );
      } catch (err) {
        check(
          `${viewportName}: authenticated real-art journey works end to end`,
          false,
          err.message,
        );
      }
      check(
        `${viewportName}: zero unexpected console/page errors during the authenticated journey`,
        consoleErrors.length === 0,
        consoleErrors.join(' | '),
      );
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nSummary: ${passCount} passed, ${failCount} failed`);
  console.log(`Screenshots written to: ${evidenceDir}`);
  if (failCount > 0) {
    console.error('\nPHASE 1 REAL ART VERIFICATION FAILED.');
    process.exit(1);
  }
  console.log('\nPHASE 1 REAL ART VERIFICATION PASSED.');
}

main().catch((err) => {
  console.error('\nPhase 1 real art verification crashed with an unexpected error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
