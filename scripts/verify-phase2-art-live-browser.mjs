#!/usr/bin/env node
/* global document */
/**
 * LIVE browser check of the registered Phase 2 art against the running preview (default
 * http://127.0.0.1:5050: real backend, real Sheet, real Drive media). One isolated generated,
 * journey-complete user per run (`artlive_*`); the real owner's rows are never read or written.
 * Screenshots: docs/reports/PHASE2/ART_LIVE/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5050';
const out = path.resolve('docs/reports/PHASE2/ART_LIVE');
fs.mkdirSync(out, { recursive: true });
const gateway = getProductionGatewayOrNull();
const userId = `artlive_${Date.now()}`;
const iso = new Date().toISOString();
const w = (tab, row) => gateway.appendRow(tab, row);
await w('24_PLAYER_PROGRESS', {
  user_route_key: `${userId}|first_opening`,
  user_id: userId,
  story_route_id: 'first_opening',
  status: 'in_progress',
  current_beat_id: 'naming_complete',
  last_checkpoint_id: 'naming_complete',
  updated_at: iso,
});
await w('24_PLAYER_PROGRESS', {
  user_route_key: `${userId}|first_journey`,
  user_id: userId,
  story_route_id: 'first_journey',
  status: 'completed',
  first_journey_completed: 'TRUE',
  map_unlocked: 'TRUE',
  completed_at: iso,
  updated_at: iso,
});
await w('37_CHARACTER_STATE', {
  user_character_key: `${userId}|var`,
  user_id: userId,
  character_id: 'var',
  personal_name: 'Preview',
  selected_gender: 'female',
  updated_at: iso,
});
const now = new Date();
const sessionId = buildSessionId('gate', `artlive_${userId}`);
await createOrReconcileSession(gateway, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: `artlive-${userId}`,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600_000),
});

const results = [];
const check = (n, ok, d = '') => {
  results.push({ n, ok, d });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
};
const browser = await chromium.launch();
for (const [tag, spec] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
].filter(([t]) => !process.argv[2] || t === process.argv[2])) {
  const ctx = await browser.newContext(spec);
  await ctx.addCookies([
    { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/media/') && r.status() >= 400)
      bad.push(`${r.status()} ${r.url().split('/api/media/')[1]}`);
  });
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const settle = async () => {
    await page
      .waitForFunction(
        () => {
          const i = document.querySelector('[data-testid="stage-painting"]');
          return !i || (i.complete && i.naturalWidth > 0);
        },
        null,
        { timeout: 40000 },
      )
      .catch(() => {});
    await page.waitForTimeout(600);
  };
  const info = async (label) => {
    const r = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="stage-painting"]');
      const de = document.documentElement;
      return {
        painting: img
          ? `${img.naturalWidth}x${img.naturalHeight} ${img.currentSrc.split('/api/media/')[1] ?? img.currentSrc.slice(0, 40)}`
          : null,
        overflow: de.scrollWidth > de.clientWidth + 1,
        temp: !!document.querySelector('[data-testid="temporary-visual"]'),
      };
    });
    check(
      `${tag}: ${label} shows registered painting`,
      !!r.painting && !r.painting.startsWith('0x'),
      r.painting ?? 'none',
    );
    check(`${tag}: ${label} no horizontal overflow`, !r.overflow);
    await page.screenshot({ path: path.join(out, `${label}-${tag}.png`) });
  };
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await settle();
    await info('start');
    const places = ['cottage', 'church', 'cafe', 'junction', 'arcade', 'farm', 'museum'];
    for (const id of places) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = results.length;
        try {
          if (id === 'junction') {
            // The junction is not a map pin: reach it by walking back from the Cafe.
            await page
              .locator('[data-testid="cafe-back"], [data-testid="cafe-leave"]')
              .first()
              .click({ timeout: 10000 });
            await page.waitForTimeout(800);
            if ((await tid('world-experience').getAttribute('data-place')) === 'cafe')
              await tid('cafe-back').click({ timeout: 10000 });
            await tid('world-experience')
              .and(page.locator('[data-place="junction"]'))
              .waitFor({ timeout: 15000 });
            await settle();
            await info('place-junction');
            break;
          }
          if ((await tid('world-experience').getAttribute('data-place')) !== 'map') {
            await tid('open-map').first().click({ timeout: 10000 });
            await tid('world-experience')
              .and(page.locator('[data-place="map"]'))
              .waitFor({ timeout: 15000 });
          }
          await tid(`map-pin-${id}`).click({ timeout: 10000 });
          await tid('world-experience')
            .and(page.locator(`[data-place="${id}"]`))
            .waitFor({ timeout: 15000 });
          await settle();
          await info(`place-${id}`);
          if ((await tid('world-experience').getAttribute('data-view')) === 'exterior') {
            const enter = page.locator('[data-testid$="-enter"]').first();
            if (await enter.count()) {
              await enter.click();
              await page.waitForTimeout(600);
              await settle();
              await info(`place-${id}-interior`);
            }
          }
          if (
            (await tid('world-experience').getAttribute('data-view')) === 'interior' &&
            (await page.locator('[data-testid$="-leave"]').count())
          ) {
            // stay: the map button is reachable from interiors too when present
          }
        } catch (e) {
          check(`${tag}: reach ${id}`, false, e.message.slice(0, 120));
        }
        if (results.slice(before).every((r) => r.ok)) {
          await page.waitForTimeout(9000);
          break;
        }
        results.length = before; // Sheets quota / slow media: wait and retry the place
        await page.waitForTimeout(30000);
        if (attempt === 2) {
          await page.screenshot({ path: path.join(out, `FAILED-${id}-${tag}.png`) });
          check(`${tag}: ${id} after 3 attempts`, false);
        }
      }
    }
    try {
      await tid('open-map').first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `map-${tag}.png`) });
    } catch {
      // the map screenshot is best-effort
    }
    check(`${tag}: no media request failed`, bad.length === 0, bad.join(', '));
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    check(`${tag}: run`, false, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed (isolated user ${userId})`,
);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ userId, results }, null, 2));
process.exit(failed.length ? 1 : 0);
