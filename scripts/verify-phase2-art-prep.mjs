#!/usr/bin/env node
/* global document, window */
/**
 * Phase 2 art-integration preparation checks, on the built app over the in-memory
 * SAMPLE fixture (never the live Sheet, never the real owner's progress):
 *
 *  1. Junction, with ONE isolated fixture user, BEFORE and AFTER Church completion:
 *     Church, Cafe and the road ahead — unlocked navigation and locked explanations.
 *  2. Responsive composition of the Cottage (exterior + interior) on labelled SAMPLE
 *     composition guides across desktop/laptop/ultrawide/phone/small-phone/tablet crops:
 *     the cat home, chick home, countdown, mailbox and reading corner stay reachable
 *     (inside the frame, clear of title/HUD) and the portrait guide is used on portrait.
 *
 * Screenshots: docs/reports/PHASE2/ART_PREP/. Run `npm run build` first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture, seedPhase1Player } from './lib/phase2-fixture.mjs';

const out = path.resolve('docs/reports/PHASE2/ART_PREP');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false },
  mobile: { viewport: { width: 390, height: 844 }, mobile: true },
};
const CROPS = {
  ultrawide: { width: 2560, height: 1080 },
  laptop: { width: 1280, height: 720 },
  short: { width: 1366, height: 600 },
  tablet_portrait: { width: 768, height: 1024 },
  phone_small: { width: 360, height: 640 },
  phone_tall: { width: 412, height: 915 },
};

async function open(name, { viewport, mobile }) {
  const { server, gateway, origin } = await startPhase2Fixture({ compositionGuides: true });
  const userId = `artprep_${name}_${Date.now()}`;
  const sessionId = await seedPhase1Player(gateway, userId);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
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
  const click = async (id) => {
    await tid(id).first().waitFor({ state: 'visible', timeout: 15000 });
    await tid(id).first().click();
  };
  const place = async (id, view) => {
    await expect(tid('world-experience')).toHaveAttribute('data-place', id, { timeout: 15000 });
    if (view) await expect(tid('world-experience')).toHaveAttribute('data-view', view);
  };
  return {
    server,
    gateway,
    origin,
    userId,
    browser,
    page,
    errors,
    tid,
    click,
    place,
    close: async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}

async function inFrame(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const title = document.querySelector('[data-testid="place-title"]')?.getBoundingClientRect();
    const hud = document.querySelector('[data-testid="keys-hud"]')?.getBoundingClientRect();
    const overlap = (a, b) =>
      b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      found: true,
      inside:
        r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      overTitle: overlap(r, title),
      overHud: overlap(r, hud),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    };
  }, testId);
}

// ---------------------------------------------------------------- 1. junction
async function junction(name, spec) {
  console.log(`\n=== junction · ${name} ===`);
  const ctx = await open(`junction_${name}`, spec);
  const { page, tid, click, place } = ctx;
  const keyCount = async (key) =>
    Number((await tid(`key-${key}`).locator('span').last().textContent())?.trim() ?? '0');
  const shot = async (n) => {
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`${name}: ${n} has no horizontal overflow`, overflow <= 0, `overflow=${overflow}`);
    await page.screenshot({ path: path.join(out, `${n}-${name}.png`) });
  };
  const toJunction = async () => {
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });
    await click('marker-road_onward');
    await place('junction');
  };
  const reachable = async (label) => {
    for (const id of ['junction-church', 'junction-ahead', 'junction-cafe', 'junction-back']) {
      const f = await inFrame(page, id);
      check(
        `${name}: ${label} — ${id} is inside the frame and clear of the title`,
        f.found && f.inside && !f.overTitle,
        JSON.stringify(f),
      );
    }
  };
  const explain = async (id, pattern) => {
    await tid(id).click({ force: true }); // a real player can tap an aria-disabled control
    await expect(tid('junction-explain-text')).toBeVisible();
    const text = (await tid('junction-explain-text').textContent()) ?? '';
    check(`${name}: ${id} explains why it is locked`, pattern.test(text), text);
  };
  try {
    await page.goto(ctx.origin, { waitUntil: 'networkidle' });
    await place('beach');
    for (const node of ['beach_steps', 'steps_church_approach', 'church_focus']) {
      await click('walk-forward');
      await page.waitForSelector(`[data-testid="scene-stage-${node}"]`, { timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await click('marker-road_onward');
    await place('junction');
    check(
      `${name}: junction art is the registered ${spec.mobile ? 'portrait' : 'landscape'} variant`,
      await page.evaluate((mobile) => {
        const img = document.querySelector('[data-testid="stage-painting"]');
        return !!img && img.naturalHeight > img.naturalWidth === mobile;
      }, spec.mobile),
    );

    // ---------- BEFORE Church completion
    check(`${name}: BEFORE — no Church key yet`, (await keyCount('key_candle')) === 0);
    await reachable('BEFORE');
    check(
      `${name}: BEFORE — Church is open (physical navigation)`,
      (await tid('junction-church').getAttribute('aria-disabled')) === null,
    );
    check(
      `${name}: BEFORE — Café and the road ahead are visibly gated`,
      (await tid('junction-cafe').getAttribute('aria-disabled')) === 'true' &&
        (await tid('junction-ahead').getAttribute('aria-disabled')) === 'true',
    );
    await shot('junction-before-church');
    await explain('junction-cafe', /Church/);
    await shot('junction-before-cafe-locked');
    await click('junction-explain-close');
    await explain('junction-ahead', /road ahead opens/);
    await click('junction-explain-close');
    await page.keyboard.press('ArrowRight');
    await expect(tid('junction-explain-text')).toBeVisible();
    await click('junction-explain-close');
    check(
      `${name}: BEFORE — exploring the locked places granted nothing`,
      (await keyCount('key_candle')) === 0 && (await keyCount('key_music')) === 0,
    );
    // Church from the junction: walking there is just movement (no key, no story change).
    await click('junction-church');
    await place('beach');
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });
    check(
      `${name}: BEFORE — walking to the Church door awarded nothing`,
      (await keyCount('key_candle')) === 0,
    );
    // The road back to the junction still works, and the keyboard reaches Church too.
    await click('marker-road_onward');
    await place('junction');
    await page.keyboard.press('ArrowLeft');
    await place('beach');
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });

    // ---------- Complete the Church (server-decided first candle)
    await click('marker-church_door');
    await place('church', 'interior');
    await click('narration-continue');
    await click('candle-candle_1');
    await expect.poll(() => keyCount('key_candle'), { timeout: 8000 }).toBe(1);
    await click('church-leave');
    await place('beach');

    // ---------- AFTER Church completion
    await toJunction();
    await reachable('AFTER');
    check(
      `${name}: AFTER — Church is still reachable`,
      (await tid('junction-church').getAttribute('aria-disabled')) === null,
    );
    check(
      `${name}: AFTER — the Café is now unlocked`,
      (await tid('junction-cafe').getAttribute('aria-disabled')) === null,
    );
    check(
      `${name}: AFTER — the road ahead is still locked (Café and VARcade come first)`,
      (await tid('junction-ahead').getAttribute('aria-disabled')) === 'true',
    );
    await shot('junction-after-church');
    await explain('junction-ahead', /road ahead opens/);
    await shot('junction-after-ahead-locked');
    await click('junction-explain-close');
    await click('junction-church');
    await place('beach');
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });
    await click('marker-road_onward');
    await place('junction');
    await click('junction-cafe');
    await place('cafe', 'exterior');
    check(`${name}: AFTER — Café navigation reaches the Café`, true);
    check(
      `${name}: AFTER — arriving at the Café awarded no music key`,
      (await keyCount('key_music')) === 0,
    );
    await click('cafe-back');
    await place('junction');
    await click('junction-back');
    await place('beach');
    check(`${name}: no console/page errors`, ctx.errors.length === 0, ctx.errors.join(' | '));
  } catch (error) {
    await page.screenshot({ path: path.join(out, `FAILURE-junction-${name}.png`) }).catch(() => {});
    check(`${name}: junction run completed`, false, String(error).slice(0, 400));
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 2. cottage
async function cottage(name, spec) {
  const { width, height } = spec.viewport;
  const portrait = width <= height;
  console.log(`
=== cottage composition · ${name} ${width}x${height} ===`);
  const ctx = await open(`cottage_${name}`, spec);
  const { page, tid, click, place } = ctx;
  try {
    // An isolated fixture user whose first journey is already complete starts in the Cottage.
    const now = new Date().toISOString();
    await ctx.gateway.appendRow('24_PLAYER_PROGRESS', {
      user_route_key: `${ctx.userId}|first_journey`,
      user_id: ctx.userId,
      story_route_id: 'first_journey',
      status: 'completed',
      first_journey_completed: 'TRUE',
      map_unlocked: 'TRUE',
      completed_at: now,
      updated_at: now,
    });
    // ...with the Walkman received and a song chosen, so the crowded HUD state is what gets checked.
    await ctx.gateway.appendRow('37_CHARACTER_STATE', {
      user_character_key: `${ctx.userId}|world_cafe`,
      user_id: ctx.userId,
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
    await page.goto(ctx.origin, { waitUntil: 'networkidle' });
    await place('cottage', 'interior');
    await expect(tid('walkman')).toBeVisible({ timeout: 15000 });
    await page.waitForSelector('[data-testid="stage-painting"]', { timeout: 15000 });
    await page.waitForTimeout(500);
    check(
      `${name}: cottage art is the registered ${portrait ? 'portrait' : 'landscape'} variant`,
      await page.evaluate((p) => {
        const img = document.querySelector('[data-testid="stage-painting"]');
        return !!img && img.naturalHeight > img.naturalWidth === p;
      }, portrait),
    );
    const reach = async (view, ids) => {
      for (const id of ids) {
        const f = await inFrame(page, id);
        check(
          `${name}: ${view} — ${id} is reachable (inside the frame, clear of title and HUD)`,
          f.found && f.inside && !f.overTitle && !f.overHud,
          JSON.stringify(f),
        );
      }
    };
    const interior = [
      'cottage-countdown',
      'cottage-var-place',
      'cottage-marcelino-place',
      'cottage-corner',
      'cottage-mailbox',
      'cottage-leave',
      'decor-decor_1',
      'decor-decor_4',
    ];
    await reach('interior', interior);
    // Characters are separate sprites, never merged into the room art or the countdown.
    check(
      `${name}: interior — Marcelino is his own sprite element (stand-in until his art is registered)`,
      (await tid('marcelino-home-sprite').count()) <= 1,
    );
    // The countdown numbers are live DOM text (not painted art): open the panel and read them.
    await click('cottage-countdown');
    const first = await tid('countdown-seconds').textContent();
    await page.waitForTimeout(1300);
    const second = await tid('countdown-seconds').textContent();
    check(
      `${name}: countdown numbers are dynamic live text`,
      first !== null && second !== null && first !== second,
      `${first} -> ${second}`,
    );
    await page.screenshot({ path: path.join(out, `cottage-countdown-${name}.png`) });
    await click('countdown-panel-close');
    await page.screenshot({ path: path.join(out, `cottage-interior-${name}.png`) });
    // The persistent controls sit clear of the interactive anchors and the title.
    const walkman = await inFrame(page, 'keys-hud');
    const walkmanChip = await inFrame(page, 'walkman');
    check(
      `${name}: interior — the Walkman is visible, inside the frame and clear of the place title`,
      walkmanChip.found && walkmanChip.inside && !walkmanChip.overTitle,
      JSON.stringify(walkmanChip),
    );
    check(
      `${name}: interior — key/Walkman HUD stays inside the frame`,
      walkman.inside,
      JSON.stringify(walkman),
    );

    await click('cottage-leave');
    await place('cottage', 'exterior');
    await page.waitForTimeout(500);
    await reach('exterior', [
      'cottage-outside-mailbox',
      'cottage-enter',
      'cottage-back',
      'cottage-forward',
    ]);
    await page.screenshot({ path: path.join(out, `cottage-exterior-${name}.png`) });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`${name}: no horizontal overflow`, overflow <= 0, `overflow=${overflow}`);
    check(`${name}: no console/page errors`, ctx.errors.length === 0, ctx.errors.join(' | '));
  } catch (error) {
    await page.screenshot({ path: path.join(out, `FAILURE-cottage-${name}.png`) }).catch(() => {});
    check(`${name}: cottage composition run completed`, false, String(error).slice(0, 400));
  } finally {
    await ctx.close();
  }
}

const only = process.argv[2]; // 'junction' | 'cottage' | undefined
if (!only || only === 'junction') {
  for (const [name, spec] of Object.entries(VIEWPORTS)) await junction(name, spec);
}
if (!only || only === 'cottage') {
  for (const [name, spec] of Object.entries(VIEWPORTS)) await cottage(name, spec);
  for (const [name, viewport] of Object.entries(CROPS)) {
    await cottage(name, { viewport, mobile: viewport.width < 500 });
  }
}

fs.writeFileSync(path.join(out, 'art-prep-results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join('\n  '));
  process.exit(1);
}
