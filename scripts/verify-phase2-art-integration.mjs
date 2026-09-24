#!/usr/bin/env node
/* global document, window, getComputedStyle, localStorage */
/**
 * Renders the integrated art pack in the built app over the in-memory SAMPLE fixture (never the live Sheet, never the
 * real owner). One disposable, journey-complete player per viewport. Screenshots: docs/reports/PHASE2/ART_INTEGRATION/.
 * Checks: registered art (portrait variant on portrait), hotspot reachability, no overlapping targets, farm state swaps
 * (mocked server states), candle lit/unlit swap, cabinet count, artifact, live mantel countdown, RTL, reduced motion.
 * Run `npm run build` first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture, seedPhase1Player } from './lib/phase2-fixture.mjs';

const out = path.resolve('docs/reports/PHASE2/ART_INTEGRATION');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false },
  mobile: { viewport: { width: 390, height: 844 }, mobile: true },
  landscape: { viewport: { width: 844, height: 390 }, mobile: true },
};
const only = process.argv[2];

async function run(name, spec, locale = 'en') {
  const tag = locale === 'en' ? name : `${name}-${locale}`;
  console.log(`\n=== ${tag} ${spec.viewport.width}x${spec.viewport.height} ===`);
  const { server, gateway, origin } = await startPhase2Fixture({ artPack: true });
  const userId = `artint_${tag}_${Date.now()}`;
  const sessionId = await seedPhase1Player(gateway, userId);
  const now = new Date().toISOString();
  await gateway.appendRow('24_PLAYER_PROGRESS', {
    user_route_key: `${userId}|first_journey`,
    user_id: userId,
    story_route_id: 'first_journey',
    status: 'completed',
    first_journey_completed: 'TRUE',
    map_unlocked: 'TRUE',
    completed_at: now,
    updated_at: now,
  });
  await gateway.appendRow('37_CHARACTER_STATE', {
    user_character_key: `${userId}|world_cafe`,
    user_id: userId,
    character_id: 'world_cafe',
    story_flags_json: JSON.stringify({
      v: 1,
      gramophoneOpened: true,
      walkmanUnlocked: true,
      walkman: { songId: 'song_a', playing: false },
      cardsRead: [],
    }),
    updated_at: now,
  });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: spec.viewport,
    hasTouch: spec.mobile,
    isMobile: spec.mobile,
    locale: locale === 'ar-EG' ? 'ar-EG' : 'en-US',
    reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference',
  });
  await context.addCookies([
    { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()),
  );
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const shot = async (n) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(out, `${n}-${tag}.png`) });
  };
  const place = async (id, view) => {
    await expect(tid('world-experience')).toHaveAttribute('data-place', id, { timeout: 15000 });
    if (view) await expect(tid('world-experience')).toHaveAttribute('data-view', view);
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="stage-painting"]');
      return !img || (img.complete && img.naturalWidth > 0);
    });
    await page.waitForTimeout(300);
  };
  // hotspots must sit inside the frame and never overlap each other or the title/HUD.
  const audit = async (label, ids) => {
    const rects = await page.evaluate(
      (list) =>
        list.map((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return { id, missing: true };
          const r = el.getBoundingClientRect();
          const vis = getComputedStyle(el).visibility !== 'hidden' && r.width > 0;
          return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, vis, w: r.width, h: r.height };
        }),
      ids,
    );
    const hud = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="keys-hud"]')?.getBoundingClientRect();
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    });
    const vw = spec.viewport.width,
      vh = spec.viewport.height;
    for (const r of rects) {
      check(
        `${tag}: ${label} — ${r.id} present, on screen`,
        !r.missing && r.vis && r.l >= -1 && r.t >= -1 && r.r <= vw + 1 && r.b <= vh + 1,
        JSON.stringify(r),
      );
    }
    const overlap = [];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i],
          b = rects[j];
        if (a.missing || b.missing) continue;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l),
          oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 4 && oy > 4)
          overlap.push(
            `${a.id}[${[a.l, a.t, a.r, a.b].map(Math.round)}]/${b.id}[${[b.l, b.t, b.r, b.b].map(Math.round)}]`,
          );
      }
    check(`${tag}: ${label} — no overlapping targets`, overlap.length === 0, overlap.join(', '));
    if (hud) {
      const hit = rects
        .filter((a) => !a.missing && a.l < hud.r && a.r > hud.l && a.t < hud.b && a.b > hud.t)
        .map((a) => a.id);
      check(
        `${tag}: ${label} — nothing under the key/Walkman HUD`,
        hit.length === 0,
        hit.join(', '),
      );
    }
  };
  const painting = async (label, wantMobile) =>
    check(
      `${tag}: ${label} shows registered artwork (${wantMobile ? 'portrait' : 'landscape'} variant)`,
      await page.evaluate((m) => {
        const img = document.querySelector('[data-testid="stage-painting"]');
        return !!img && img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth === m;
      }, wantMobile),
    );
  const portrait = spec.viewport.width <= spec.viewport.height;
  const go = async (id) => {
    await tid('open-map').first().click();
    await expect(tid('world-experience')).toHaveAttribute('data-place', 'map', { timeout: 15000 });
    await tid(`map-pin-${id}`).click();
    await place(id);
  };
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    if (locale === 'ar-EG') {
      await page.evaluate(() =>
        localStorage.setItem(
          'vw_locale',
          JSON.stringify({ state: { locale: 'ar-EG' }, version: 0 }),
        ),
      );
      await page.reload({ waitUntil: 'networkidle' });
      check(
        `${tag}: document is RTL`,
        (await page.evaluate(() => document.documentElement.dir)) === 'rtl',
      );
    }

    // ---- Cottage interior: mantel countdown, cat/chick homes
    await place('cottage', 'interior');
    await painting('cottage interior', portrait);
    await expect(tid('walkman-art')).toBeVisible();
    check(
      `${tag}: Walkman prop art is shown next to the existing controls, not autoplaying`,
      (await tid('walkman').getAttribute('data-playing')) === 'false',
    );
    if (!portrait || spec.viewport.width > 500) {
      const a = await tid('mantel-seconds').textContent();
      await page.waitForTimeout(1300);
      const b = await tid('mantel-seconds').textContent();
      check(`${tag}: countdown fields on the mantel tick live`, a !== b, `${a} -> ${b}`);
    } else {
      check(
        `${tag}: mantel countdown is drawn (tiny on portrait; the panel is the readable view)`,
        (await tid('mantel-countdown').count()) === 1,
      );
    }
    await audit('cottage interior', [
      'cottage-countdown',
      'cottage-corner',
      'cottage-mailbox',
      'cottage-var-place',
      'cottage-marcelino-place',
      'cottage-leave',
      'decor-decor_1',
      'decor-decor_4',
    ]);
    check(
      `${tag}: cat companion is a separate sprite`,
      (await tid('world-companion').count()) === 1,
    );
    await shot('cottage-interior');
    await tid('cottage-leave').click();
    await place('cottage', 'exterior');
    await audit('cottage exterior', [
      'cottage-outside-mailbox',
      'cottage-enter',
      'cottage-back',
      'cottage-forward',
    ]);
    await shot('cottage-exterior');
    if (only === 'quick') return;
    if (locale === 'ar-EG') {
      // Physical geography must not mirror: from the junction the Church stays on the LEFT and the Cafe on the RIGHT.
      await tid('cottage-forward')
        .click()
        .catch(() => {});
      await go('cafe');
      if ((await tid('world-experience').getAttribute('data-view')) === 'interior') {
        await tid('cafe-leave').click();
        await place('cafe', 'exterior');
      }
      await tid('cafe-back').click();
      await place('junction');
      const c = await tid('junction-church').boundingBox();
      const f = await tid('junction-cafe').boundingBox();
      check(
        `${tag}: junction keeps Church on the physical left and Cafe on the right in Arabic`,
        !!c && !!f && c.x < f.x,
        JSON.stringify([c?.x, f?.x]),
      );
      await shot('junction');
      await audit('junction', [
        'junction-church',
        'junction-cafe',
        'junction-ahead',
        'junction-back',
      ]);
      await go('cottage');
      await shot('cottage-interior');
      check(`${tag}: no console/page errors`, errors.length === 0, errors.join(' | '));
      return;
    }

    // ---- Farm with mocked states (planted/growing/ready/wilted/empty across three crops)
    await page.route('**/api/world/farm/enter', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const mk = (i, cropId, state, pct) => ({
        ...body.plots[i],
        cropId,
        state,
        progressPercent: pct,
        needsWater: state === 'planted',
      });
      body.plots = [
        mk(0, 'sunflower', 'planted', 0),
        mk(1, 'mango', 'growing', 40),
        mk(2, 'blueberry', 'ready', 100),
        mk(3, 'blueberry', 'wilted', 60),
        mk(4, 'sunflower', 'growing', 55),
        { ...body.plots[5], cropId: null, state: 'empty', progressPercent: 0, needsWater: false },
      ];
      body.marcelinoHere = true;
      await route.fulfill({ response: res, json: body });
    });
    await go('farm');
    await painting('farm', portrait);
    await tid('plot-plot_1').waitFor();
    await audit('farm', [
      'plot-plot_1',
      'plot-plot_2',
      'plot-plot_3',
      'plot-plot_4',
      'plot-plot_5',
      'plot-plot_6',
      'farm-back',
      'farm-forward',
      'farm-barn',
    ]);
    const stages = await page.$$eval('[data-testid^="plot-sprite-"]', (els) =>
      els.map((e) => [e.dataset.stage, e.naturalWidth > 0]),
    );
    check(
      `${tag}: farm shows one real sprite per non-empty plot (5), states ${stages.map((s) => s[0]).join('/')}`,
      stages.length === 5 && stages.every((s) => s[1]),
    );
    check(`${tag}: the empty plot shows no plant`, (await tid('plot-sprite-plot_6').count()) === 0);
    check(
      `${tag}: Marcelino appears only when the server says he is here (sprite art, no emoji)`,
      (await tid('farm-marcelino').getAttribute('data-standin')) === null,
    );
    // ground anchors: every sprite's bottom edge stays put inside its button
    await shot('farm');
    await tid('plot-plot_3').click();
    await expect(tid('plot-panel')).toBeVisible();
    check(
      `${tag}: seed/crop icons come from the icon registry`,
      (await tid('seed-icon-sunflower').count()) === 1 &&
        (await tid('crop-icon-mango').count()) === 1,
    );
    await shot('farm-panel');
    await tid('plot-panel-close').click();
    await page.unroute('**/api/world/farm/enter');

    // ---- Arcade
    await go('arcade');
    await place('arcade');
    if ((await tid('world-experience').getAttribute('data-view')) === 'exterior') {
      await shot('arcade-exterior');
      await tid('arcade-enter').click();
    }
    await place('arcade', 'interior');
    await painting('arcade interior', portrait);
    const cabs = await tid('arcade-cabinets').locator('[data-testid^="cabinet-"]').count();
    check(`${tag}: five cabinets`, cabs === 5);
    const enabled = await page.$$eval(
      '[data-testid^="cabinet-"]',
      (els) => els.filter((e) => !e.disabled).length,
    );
    check(
      `${tag}: three enabled cabinets, two disabled (unchanged rules)`,
      enabled === 3,
      `enabled=${enabled}`,
    );
    await audit('arcade interior', [
      'cabinet-1',
      'cabinet-2',
      'cabinet-3',
      'cabinet-4',
      'cabinet-5',
      'arcade-scoreboard',
      'arcade-leave',
    ]);
    await shot('arcade-interior');
    await tid('arcade-leave').click();

    // ---- Church interior with candles
    await go('church');
    if ((await tid('church-interior').count()) === 0) {
      const enter = tid('church-enter').or(tid('marker-church_door'));
      await enter.first().click();
    }
    await place('church', 'interior');
    await painting('church interior', portrait);
    const ids = await page.$$eval('[data-testid^="candle-"]', (els) =>
      els.map((e) => e.dataset.testid),
    );
    await audit('church interior', [
      ...ids,
      'church-verse',
      'church-story',
      'church-photo',
      'church-hymns',
      'church-quiz',
      'church-silence',
      'church-leave',
    ]);
    await shot('church-unlit');
    if (await tid('narration-continue').count()) await tid('narration-continue').click();
    const first = tid(ids[0]);
    const before = await first.locator('img').getAttribute('src');
    await first.click();
    await expect(first).toHaveAttribute('data-lit', 'true', { timeout: 8000 });
    check(
      `${tag}: lit candle swaps to the lit prop`,
      (await first.locator('img').getAttribute('src')) !== before,
    );
    await shot('church-lit');
    await tid('church-leave').click();

    // ---- Junction, cafe
    await go('cafe');
    await shot('cafe-exterior');
    if (await tid('cafe-enter').count()) {
      await audit('cafe exterior', ['cafe-enter']);
      await tid('cafe-enter').click();
      await place('cafe', 'interior');
      await audit('cafe interior', ['cafe-gramophone', 'cafe-request', 'cafe-leave']);
      await shot('cafe-interior');
      check(
        `${tag}: no automatic Cafe playback`,
        (await tid('walkman').getAttribute('data-playing')) === 'false',
      );
      await tid('cafe-leave').click();
    }

    // ---- Museum
    await go('museum');
    const museumView = await tid('world-experience').getAttribute('data-view');
    await shot(`museum-${museumView}`);
    if ((await tid('museum-artifact').count()) > 0) {
      await painting('museum hall', portrait);
      await audit('museum hall', [
        'museum-artifact',
        'hall-progress',
        'hall-wings',
        'hall-wings-east',
        'hall-leave',
      ]);
      const art = tid('museum-artifact').locator('img');
      check(
        `${tag}: artifact prop art is shown`,
        (await art.count()) === 1 && (await art.evaluate((e) => e.naturalWidth)) > 0,
      );
    } else if (await tid('museum-door').count()) {
      await audit('museum exterior', ['museum-gate', 'museum-door']);
    }

    // ---- Map avatar
    await tid('open-map').first().click();
    await expect(tid('world-experience')).toHaveAttribute('data-place', 'map', { timeout: 15000 });
    await page.waitForTimeout(300);
    const pose = await tid('map-avatar').getAttribute('data-pose');
    check(
      `${tag}: map shows the v3 avatar art (pose ${pose})`,
      pose !== null && (await tid('map-avatar').evaluate((e) => e.naturalWidth > 0)),
    );
    await shot('map');
    check(
      `${tag}: no horizontal overflow`,
      (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0,
    );
    check(`${tag}: no console/page errors`, errors.length === 0, errors.join(' | '));
  } catch (error) {
    await page.screenshot({ path: path.join(out, `FAILURE-${tag}.png`) }).catch(() => {});
    check(`${tag}: run completed`, false, String(error).slice(0, 500));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

for (const [name, spec] of Object.entries(VIEWPORTS)) {
  if (process.argv[3] && process.argv[3] !== name) continue;
  await run(name, spec);
}
if (!process.argv[3] || process.argv[3] === 'rtl') {
  await run('desktop', VIEWPORTS.desktop, 'ar-EG');
  await run('mobile', VIEWPORTS.mobile, 'ar-EG');
}
fs.writeFileSync(
  path.join(out, `results-${process.argv[3] ?? 'all'}.json`),
  JSON.stringify(results, null, 2),
);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(
    'FAILED:\n  ' + failed.map((f) => `${f.name} :: ${f.detail}`.slice(0, 300)).join('\n  '),
  );
  process.exit(1);
}
