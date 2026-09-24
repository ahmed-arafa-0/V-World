#!/usr/bin/env -S npx tsx
/**
 * birthday_2026 (M16 narrow scope) — a REAL rendered-browser preview against isolated fixtures,
 * never the live Sheet, never the real owner's clock or progress. Mirrors
 * `scripts/verify-phase1-map-media-browser.mjs`'s "prove it renders in an actual browser, not just
 * jsdom" approach, but swaps the real Google credential for `FakeGoogleSheetsClient` + the shared
 * birthday fixture builders (`apps/functions/tests/helpers/world-fixture.ts`) and a real-time
 * countdown window (so the live countdown genuinely ticks down on screen during this run), per the
 * approved scope's verification instruction: "Use isolated fixtures and an event-scoped test clock;
 * never change the live global clock or owner progress."
 *
 * Screenshots are written to scripts/.birthday-preview/ (gitignored scratch output) for review —
 * never committed, never touching the real Sheet, real credentials, or Ahmed's real Gate code.
 *
 * Run: npx tsx scripts/verify-birthday-preview.ts   (after `npm run build --workspace=apps/web`)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/functions/src/app.js';
import { SheetGateway } from '../apps/functions/src/repositories/sheet-gateway.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/src/services/session.service.js';
import { FakeGoogleSheetsClient } from '../apps/functions/tests/helpers/fake-sheets-client.js';
import {
  addBirthdayFixtures,
  addCompanionCat,
  buildWorldWorkbook,
  completePhase1,
} from '../apps/functions/tests/helpers/world-fixture.js';

const LOCALE = process.env.BIRTHDAY_PREVIEW_LOCALE === 'ar-EG' ? 'ar-EG' : 'en';
/** `desktop` (default), `portrait` (390×844, mobile portrait) or `landscape` (844×390). */
const VIEWPORT_NAME = process.env.BIRTHDAY_PREVIEW_VIEWPORT ?? 'desktop';
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};
const VIEWPORT = VIEWPORTS[VIEWPORT_NAME] ?? VIEWPORTS.desktop!;
const USER_ID = `birthday_preview_user_${LOCALE}_${VIEWPORT_NAME}`;
const OUT_DIR = path.resolve(`scripts/.birthday-preview/${LOCALE}_${VIEWPORT_NAME}`);
const WEB_DIST = path.resolve('apps/web/dist');

function mask(id: string): string {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

async function main() {
  if (!fs.existsSync(WEB_DIST)) {
    console.error(
      'BLOCKER: apps/web/dist is missing. Run `npm run build --workspace=apps/web` first.',
    );
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // The event's target moment is set 15 real seconds from now, so the LIVE countdown genuinely
  // ticks down in real wall-clock time during this script — never the real 2026-09-26 boundary,
  // never the live Sheet's dates. `now: () => new Date()` (below) is the real clock throughout;
  // only the fixture's own event window is synthetic.
  const targetAt = new Date(Date.now() + 15_000);
  const endAt = new Date(targetAt.getTime() + 2 * 24 * 60 * 60 * 1000);

  const workbook = buildWorldWorkbook((wb) => {
    addBirthdayFixtures(wb, USER_ID);
    addCompanionCat(wb, 'Mango', 'female', USER_ID);
    const events = wb['17_EVENTS']!;
    const header = events[0]!;
    const targetCol = header.indexOf('target_at');
    const endCol = header.indexOf('end_at');
    const startCol = header.indexOf('start_at');
    for (const r of events.slice(1)) {
      if (r[header.indexOf('event_id')] === 'birthday_2026') {
        r[targetCol] = targetAt.toISOString();
        r[startCol] = targetAt.toISOString();
        r[endCol] = endAt.toISOString();
      }
    }
  });

  const gateway = new SheetGateway(new FakeGoogleSheetsClient(workbook), { ttlSeconds: 1 });
  // The Gate/doors/naming onboarding (`first_opening`, a route distinct from `first_journey`) is
  // completed here so the world actually mounts — proving "accessible even with the first journey
  // unfinished" means the main `first_journey` (Church/Café/.../Museum), not the mandatory,
  // one-time naming step every player passes before reaching the world at all.
  await completePhase1(gateway, USER_ID);
  const app = createApp({
    getGateway: () => gateway,
    getDriveClient: () => null,
    now: () => new Date(),
    isProduction: () => false,
    staticRoot: WEB_DIST,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const origin = `http://127.0.0.1:${port}`;

  const sessionId = buildSessionId('gate', `birthday_preview_${Date.now()}`);
  const now = new Date();
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: USER_ID,
    ip: '127.0.0.1',
    deviceId: 'birthday-preview',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
  console.log(
    `Owner session minted: ${mask(sessionId)} (isolated fixture user, never the real owner)`,
  );
  console.log(
    `Fixture target_at: ${targetAt.toISOString()} (15s from script start, not the real date)\n`,
  );

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
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
    await page.goto(origin, { waitUntil: 'networkidle' });

    if (LOCALE === 'ar-EG') {
      await page.getByTestId('flag-ar-EG').click();
      await page.waitForTimeout(300);
    }

    await page.waitForSelector('[data-testid="birthday-invitation"]', { timeout: 15_000 });
    await page.screenshot({ path: path.join(OUT_DIR, '1-invitation.png') });
    console.log('PASS  Invitation rendered');

    await page.getByTestId('birthday-celebrate-now').click();
    await page.waitForSelector('[data-testid="birthday-countdown-step"]');
    await page.screenshot({ path: path.join(OUT_DIR, '2-countdown-live.png') });
    console.log('PASS  Live countdown rendered');

    // Let the real 15s window elapse — the server clock (real `now()`) crosses the boundary on its
    // own; the client recalculates from the target, never an increment timer.
    await page.waitForSelector('[data-testid="birthday-reveal-step"]', { timeout: 20_000 });
    await page.screenshot({ path: path.join(OUT_DIR, '3-reveal-confetti.png') });
    console.log('PASS  Confetti/greeting rendered on crossing the real boundary');

    await page.getByTestId('birthday-continue-reveal').click();
    await page.waitForSelector('[data-testid="birthday-garden-step"]');
    await page.screenshot({ path: path.join(OUT_DIR, '4-garden.png') });
    console.log('PASS  Garden celebration rendered (cat + Marcelino present)');

    await page.getByTestId('birthday-continue-garden').click();
    await page.waitForSelector('[data-testid="birthday-cake-step"]');
    await page.screenshot({ path: path.join(OUT_DIR, '5-cake-before.png') });
    await page.getByTestId('birthday-candle').click();
    await page.screenshot({ path: path.join(OUT_DIR, '6-cake-extinguished.png') });
    console.log('PASS  Candle extinguish interaction works');

    await page.getByTestId('birthday-wish-skip').click();
    await page.getByTestId('birthday-continue-cake').click();
    await page.waitForSelector('[data-testid="birthday-letter-step"]');
    await page.screenshot({ path: path.join(OUT_DIR, '7-letter.png') });
    console.log('PASS  Letter rendered');

    await page.getByTestId('birthday-continue-letter').click();
    await page.waitForSelector('[data-testid="birthday-gifts-step"]');
    await page.getByTestId('birthday-gifts-claim').click();
    await page.waitForSelector('[data-testid="birthday-gifts-claimed"]');
    await page.screenshot({ path: path.join(OUT_DIR, '8-gifts-claimed.png') });
    console.log('PASS  Gifts claimed (letter + decoration + achievement)');

    await page.getByTestId('birthday-continue-gifts').click();
    await page.waitForSelector('[data-testid="birthday-gifts-step"]', { state: 'detached' });
    await page.screenshot({ path: path.join(OUT_DIR, '9-complete.png') });
    console.log('PASS  Completion persisted and overlay closed');

    console.log(`\nAll screenshots written to ${OUT_DIR}`);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(
    '\nBIRTHDAY PREVIEW COMPLETE. Isolated fixture only — no live Sheet or real owner data touched.',
  );
}

main().catch((err) => {
  console.error('\nBirthday preview crashed:');
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
