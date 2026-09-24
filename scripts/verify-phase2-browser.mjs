#!/usr/bin/env node
/* global document, window */
/**
 * Phase 2 end-to-end browser verification: the real built app and real backend
 * over an in-memory SAMPLE-content Sheet/Drive (see scripts/lib/phase2-fixture.mjs).
 * Plays the ENTIRE first journey (Church → Café → VARcade → Cottage/Marcelino →
 * Sunberry Fields → The Everkeep → Map) on desktop and mobile, checks layout,
 * localization/RTL, persistence across reload, and captures screenshots into
 * docs/reports/PHASE2/. Never touches the live Sheet or the real owner's data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture, seedPhase1Player } from './lib/phase2-fixture.mjs';

const out = path.resolve('docs/reports/PHASE2');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function run(viewportName, viewport, mobile) {
  console.log(`\n=== ${viewportName} ===`);
  const { server, gateway, origin } = await startPhase2Fixture();
  const userId = `phase2_${viewportName}_${Date.now()}`;
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
  const shot = async (name) => {
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(
      `${viewportName}: ${name} has no horizontal overflow`,
      overflow <= 0,
      `overflow=${overflow}`,
    );
    await page.screenshot({ path: path.join(out, `${name}-${viewportName}.png`) });
  };
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const click = async (id) => {
    await tid(id).first().waitFor({ state: 'visible', timeout: 15000 });
    await tid(id).first().click();
  };
  const place = async (id, view) => {
    await expect(tid('world-experience')).toHaveAttribute('data-place', id, { timeout: 15000 });
    if (view) await expect(tid('world-experience')).toHaveAttribute('data-view', view);
  };
  const keyCount = async (key) =>
    Number((await tid(`key-${key}`).locator('span').last().textContent())?.trim() ?? '0');
  const keyIs = async (label, key, n) => {
    let value = -1;
    try {
      await expect.poll(async () => (value = await keyCount(key)), { timeout: 8000 }).toBe(n);
    } catch {
      // reported below with the observed value
    }
    check(`${viewportName}: ${label}`, value === n, `observed ${value}, expected ${n}`);
  };

  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await place('beach');
    // The Beach chain resumes from Phase 1; walk to the Church exterior.
    for (const node of ['beach_steps', 'steps_church_approach', 'church_focus']) {
      await click('walk-forward');
      await page.waitForSelector(`[data-testid="scene-stage-${node}"]`, { timeout: 15000 });
      await page.waitForTimeout(700);
    }
    check(
      `${viewportName}: the road onward is always offered (physical navigation)`,
      (await tid('marker-road_onward').count()) === 1,
    );
    const currentBeat = () =>
      page.evaluate(
        async () => (await (await fetch('/api/world/journey')).json()).currentBeat?.beatId,
      );
    const beatBefore = await currentBeat();
    await click('marker-road_onward');
    await place('junction');
    const xOf = async (id) => await tid(id).evaluate((el) => el.getBoundingClientRect().x);
    check(
      `${viewportName}: junction — Church left, road ahead centre, Café right`,
      (await xOf('junction-church')) < (await xOf('junction-ahead')) &&
        (await xOf('junction-ahead')) < (await xOf('junction-cafe')),
    );
    await shot('junction-before-church');
    // Playwright treats aria-disabled as unclickable; a real player can tap it, so force the tap.
    await tid('junction-cafe').click({ force: true });
    await expect(tid('junction-explain-text')).toContainText(/Church/);
    await shot('junction-gated-explanation');
    await click('junction-explain-close');
    await tid('junction-ahead').click({ force: true });
    await expect(tid('junction-explain-text')).toBeVisible();
    await click('junction-explain-close');
    await page.keyboard.press('ArrowRight');
    await expect(tid('junction-explain-text')).toBeVisible();
    await click('junction-explain-close');
    check(
      `${viewportName}: walking to and inspecting the junction did not advance the story`,
      (await currentBeat()) === beatBefore &&
        !(await tid('key-key_candle').locator('span').last().textContent())?.trim().startsWith('1'),
    );
    await page.keyboard.press('ArrowLeft');
    await place('beach');
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });
    await shot('church-exterior');

    // ---- M08 Church ----
    await click('marker-church_door');
    await place('church', 'interior');
    await expect(tid('narration-continue')).toBeVisible();
    await shot('church-narration');
    await click('narration-continue');
    check(
      `${viewportName}: Church interior is temporary art, clearly labelled`,
      (await tid('temporary-visual').count()) === 1,
    );
    check(
      `${viewportName}: Walkman is silent inside the Church`,
      (await tid('walkman').count()) === 0 ||
        (await tid('walkman').getAttribute('data-silenced')) === 'true',
    );
    await click('church-verse');
    await expect(tid('church-text')).toContainText('SAMPLE verse');
    await shot('church-verse');
    await click('church-verse-panel-close');
    await click('church-quiz');
    await click('quiz-option-a');
    await expect(tid('quiz-feedback')).toContainText('SAMPLE explanation');
    await shot('church-quiz-wrong');
    await click('quiz-option-b');
    await click('quiz-option-true');
    await expect(tid('quiz-done')).toBeVisible();
    await click('church-quiz-panel-close');
    await click('church-hymns');
    await expect(tid('hymn-hymn_s')).toBeVisible();
    await click('church-hymns-panel-close');
    check(
      `${viewportName}: no hymn started by itself`,
      await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused)),
    );
    await click('candle-candle_1');
    await expect(tid('world-toast')).toBeVisible();
    await keyIs('first candle awards the candle key', 'key_candle', 1);
    await click('candle-candle_2');
    await keyIs('a second candle does not duplicate the key', 'key_candle', 1);
    await shot('church-candles');
    await click('church-leave');
    await place('beach');
    await page.waitForSelector('[data-testid="scene-stage-church_focus"]', { timeout: 15000 });

    // ---- M09 Vinyl Café ----
    await click('marker-road_onward');
    await place('junction');
    check(
      `${viewportName}: the Café is now open from the junction`,
      (await tid('junction-cafe').getAttribute('aria-disabled')) === null,
    );
    await shot('junction-open');
    await click('junction-cafe');
    await place('cafe', 'exterior');
    await shot('cafe-exterior');
    await click('cafe-enter');
    await place('cafe', 'interior');
    check(
      `${viewportName}: entering the Café starts no audio`,
      await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused)),
    );
    await click('cafe-gramophone');
    await expect(tid('song-song_a')).toBeVisible();
    check(
      `${viewportName}: several songs on one date and a retained past song are listed`,
      (await tid('song-song_b').count()) === 1 && (await tid('song-song_old').count()) === 1,
    );
    await shot('cafe-catalog');
    await click('cafe-catalog-close');
    await click('walkman-receive');
    await expect(tid('walkman')).toBeVisible();
    await click('cafe-gramophone');
    await click('walkman-song_a');
    await expect(tid('walkman-title')).toContainText('SAMPLE song A');
    await click('cafe-catalog-close');
    await click('cafe-request');
    await tid('cafe-request-input').fill('Sample request');
    await click('cafe-request-send');
    await expect(tid('cafe-request-sent')).toBeVisible();
    await click('cafe-request-panel-close');
    await shot('cafe-walkman');
    await click('cafe-leave');
    await place('cafe', 'exterior');
    await click('cafe-back');
    await place('junction');
    await click('junction-cafe');
    await place('cafe', 'exterior');

    // ---- M10 VARcade ----
    await click('cafe-forward');
    await place('arcade', 'exterior');
    await click('arcade-enter');
    await place('arcade', 'interior');
    check(
      `${viewportName}: exactly one machine is playable on the first visit`,
      (await tid('cabinet-1').getAttribute('data-locked')) === 'false' &&
        (await tid('cabinet-2').getAttribute('data-locked')) === 'true' &&
        (await tid('cabinet-3').getAttribute('data-locked')) === 'true',
    );
    await shot('arcade');
    await click('cabinet-1');
    await expect(tid('game-memory')).toBeVisible();
    check(
      `${viewportName}: the Walkman lowers during a game`,
      (await tid('walkman').getAttribute('data-duck')) === '25',
    );
    const cards = await page.locator('[data-testid^="memory-card-"]').count();
    const finished = async () => (await tid('arcade-outcome').count()) > 0;
    const card = (i) => page.locator(`[data-testid="memory-card-${i}"]`);
    const flip = async (i) => {
      await card(i).click({ timeout: 4000 });
      await expect(card(i)).not.toHaveAttribute('data-face', 'down', { timeout: 4000 });
      return ((await card(i).textContent()) ?? '').trim();
    };
    const settle = async (i, j) => {
      // A mismatch turns both cards back over after a short pause.
      await expect(card(i)).toHaveAttribute('data-face', 'down', { timeout: 4000 });
      await expect(card(j)).toHaveAttribute('data-face', 'down', { timeout: 4000 });
    };
    const symbols = new Map();
    const matched = new Set();
    for (let guard = 0; guard < 60 && !(await finished()); guard++) {
      try {
        const open = [...Array(cards).keys()].filter((i) => !matched.has(i));
        const knownPair = open.flatMap((i) =>
          open
            .filter(
              (j) => j > i && symbols.get(i) !== undefined && symbols.get(i) === symbols.get(j),
            )
            .map((j) => [i, j]),
        )[0];
        if (knownPair) {
          await flip(knownPair[0]);
          await flip(knownPair[1]);
          knownPair.forEach((i) => matched.add(i));
          continue;
        }
        const unknown = open.filter((i) => !symbols.has(i));
        const a = unknown[0];
        symbols.set(a, await flip(a));
        const partner = open.find((j) => j !== a && symbols.get(j) === symbols.get(a));
        if (partner !== undefined) {
          await flip(partner);
          matched.add(a);
          matched.add(partner);
          continue;
        }
        const b = unknown[1];
        symbols.set(b, await flip(b));
        if (symbols.get(a) === symbols.get(b)) {
          matched.add(a);
          matched.add(b);
        } else if (!(await finished())) {
          await settle(a, b);
        }
      } catch (error) {
        // The last match unmounts the cards once the result is recorded.
        if (await finished()) break;
        throw error;
      }
    }
    await expect(tid('arcade-outcome')).toContainText(/won|Not this time/, { timeout: 8000 });
    await shot('arcade-result');
    await keyIs('the arcade token key is awarded once', 'key_token', 1);
    await click('arcade-again');
    await click('arcade-game-panel-close');
    await expect.poll(() => tid('walkman').getAttribute('data-duck')).toBeNull();
    check(`${viewportName}: the Walkman volume is restored after the game`, true);
    await click('arcade-scoreboard');
    await expect(tid('arcade-board')).toContainText(/\d/);
    await click('arcade-board-close');
    await click('arcade-leave');
    await place('arcade', 'exterior');

    // ---- M11 Cottage / Marcelino ----
    await click('arcade-forward');
    await place('cottage', 'exterior');
    await shot('cottage-exterior');
    await click('cottage-enter');
    await place('cottage', 'interior');
    check(
      `${viewportName}: walking into the Cottage did not confirm the story step`,
      (await currentBeat()) === 'beat_11_cottage',
    );
    await click('cottage-arrival-continue');
    await expect.poll(currentBeat).toBe('beat_12_marcelino');
    await shot('cottage-interior');
    await click('cottage-countdown');
    await expect(tid('countdown-days')).toBeVisible();
    await shot('cottage-countdown');
    await click('countdown-panel-close');
    await click('cottage-leave');
    await place('cottage', 'exterior');
    await expect(tid('marcelino-arrives')).toBeVisible();
    await shot('marcelino-arrives');
    await click('marcelino-deliver');
    await click('marcelino-hand-over');
    await expect(tid('mailbox-panel')).toBeVisible();
    await click('mail-open-msg_first');
    await expect(tid('message-text')).toContainText(/SAMPLE message|رسالة تجريبية/);
    await shot('mailbox-message');
    // The ribbon shows the other language; the initial one was chosen at random and never changes.
    const other = (await tid('translate-ar-EG').isDisabled()) ? 'en' : 'ar-EG';
    await click(`translate-${other}`);
    await expect(tid('message-text')).toHaveAttribute('dir', other === 'ar-EG' ? 'rtl' : 'ltr');
    await click('mailbox-panel-close');
    await keyIs('the letter key is awarded by the delivery', 'key_letter', 1);

    // ---- M12 Sunberry Fields ----
    await click('cottage-forward');
    await place('farm');
    await click('plot-plot_1');
    await click('plant-sunflower');
    await click('plot-plot_1');
    await click('water-plot');
    await keyIs('first plant + water pays the sunflower key', 'key_sunflower', 1);
    await shot('farm');
    check(
      `${viewportName}: the Barn is exterior-only and locked`,
      await tid('farm-barn').isDisabled(),
    );

    // ---- M13 The Everkeep ----
    await click('farm-forward');
    await place('museum', 'exterior');
    await click('museum-gate');
    await expect(tid('museum-gate-status')).toBeVisible();
    for (const key of ['shell', 'candle', 'music', 'token', 'letter', 'sunflower'])
      await click(`socket-key_${key}`);
    await shot('museum-gate');
    await click('museum-solve');
    await click('museum-verify');
    await place('museum', 'interior');
    await keyIs('the Everkeep key is awarded after server verification', 'key_everkeep', 1);
    await click('hall-wings');
    check(
      `${viewportName}: wings are locked on the first visit and secret slots reveal nothing`,
      (await tid('wing-secret_wing').getAttribute('data-locked')) === 'true' &&
        !(await tid('hall-wings-panel').textContent()).includes('exhibit_secret'),
    );
    await shot('museum-wings');
    await click('hall-wings-panel-close');
    await click('museum-artifact');
    await shot('museum-hall');

    // ---- M14 Map ----
    check(
      `${viewportName}: the Map is not available before the final beat`,
      (await tid('open-map').count()) === 0,
    );
    await click('map-receive');
    await place('map');
    await expect(tid('open-map')).toHaveCount(0);
    await shot('map');
    check(
      `${viewportName}: the Map has the avatar and no locked places after completion`,
      (await tid('map-avatar').count()) === 1 &&
        (await page.locator('[data-testid^="mist-"]').count()) === 0,
    );
    const completed = gateway;
    const progress = (await completed.readTab('24_PLAYER_PROGRESS', { bypass: true })).rows.find(
      (r) => r.primaryKeyValue === `${userId}|first_journey`,
    );
    check(
      `${viewportName}: Sheet completion flipped 0 → 1 with Map unlocked`,
      progress?.raw.first_journey_completed === 'TRUE' && progress?.raw.map_unlocked === 'TRUE',
    );
    await click('map-pin-church');
    await place('church', 'interior');
    await click('church-leave');

    // ---- Refresh after completion starts at the Cottage, keys persisted ----
    await page.reload({ waitUntil: 'networkidle' });
    await place('cottage', 'interior');
    check(`${viewportName}: refresh after completion starts at the Cottage`, true);
    await expect(tid('open-map')).toBeVisible();
    check(
      `${viewportName}: keys persisted across reload`,
      (await keyCount('key_everkeep')) === 1 && (await keyCount('key_shell')) === 1,
    );
    await shot('cottage-after-completion');

    // ---- Arabic / RTL ----
    await page.evaluate(() =>
      window.localStorage.setItem(
        'vw_locale',
        JSON.stringify({ state: { locale: 'ar-EG' }, version: 0 }),
      ),
    );
    await page.reload({ waitUntil: 'networkidle' });
    await place('cottage', 'interior');
    check(
      `${viewportName}: Arabic switches the document to RTL`,
      (await page.evaluate(() => document.documentElement.dir)) === 'rtl',
    );
    await click('cottage-mailbox');
    await shot('cottage-arabic-mailbox');
    await click('mailbox-panel-close');
    check(
      `${viewportName}: no uncaught page errors during the whole journey`,
      errors.length === 0,
      errors.slice(0, 3).join(' | '),
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, `FAILURE-${viewportName}.png`) })
      .catch(() => undefined);
    check(
      `${viewportName}: journey completed without an exception`,
      false,
      String(error.message).split('\n')[0],
    );
  } finally {
    await browser.close();
    server.close();
  }
}

async function runNaming(viewportName, viewport, mobile, locale) {
  console.log(`\n=== naming · ${viewportName} · ${locale} ===`);
  const { server, gateway, origin } = await startPhase2Fixture();
  const userId = `phase2_naming_${viewportName}_${locale}_${Date.now()}`;
  const sessionId = await seedPhase1Player(gateway, userId, { naming: false });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  await context.addCookies([
    { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
  ]);
  await context.addInitScript(
    (l) =>
      window.localStorage.setItem(
        'vw_locale',
        JSON.stringify({ state: { locale: l }, version: 0 }),
      ),
    locale,
  );
  const page = await context.newPage();
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const tag = `${viewportName}/${locale}`;
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await tid('beach-arrival-continue').click();
    await tid('naming-prompt').waitFor();
    check(
      `naming ${tag}: two single-select gender controls, no free-text gender`,
      (await page.locator('input[name="companion-gender"]').count()) === 2 &&
        (await tid('naming-gender-input').count()) === 0,
    );
    check(
      `naming ${tag}: both options are labelled in the active language`,
      (await tid('naming-gender-male').locator('xpath=..').textContent()).trim().length > 0 &&
        (await tid('naming-gender-female').locator('xpath=..').textContent()).trim().length > 0,
      await tid('naming-gender').textContent(),
    );
    if (locale === 'ar-EG')
      check(
        `naming ${tag}: Arabic labels`,
        /ذكر/.test(await tid('naming-gender').textContent()) &&
          /أنثى/.test(await tid('naming-gender').textContent()),
      );
    await page.screenshot({ path: path.join(out, `naming-gender-${locale}-${viewportName}.png`) });
    await tid('naming-name-input').fill('Preview Name');
    await tid('naming-submit').click();
    await page.locator('[role="alert"]').waitFor();
    check(
      `naming ${tag}: submitting without a gender is refused with a localized message`,
      (await page.locator('[role="alert"]').textContent()).trim().length > 0 &&
        (await gateway.readTab('37_CHARACTER_STATE', { bypass: true })).rows.every(
          (r) => r.raw.user_id !== userId,
        ),
    );
    await tid('naming-gender-female').check();
    check(
      `naming ${tag}: single-select (choosing Male replaces Female)`,
      await (async () => {
        await tid('naming-gender-male').check();
        return (await tid('naming-gender-female').isChecked()) === false;
      })(),
    );
    await tid('naming-gender-female').check();
    await tid('naming-submit').click();
    await tid('collar-name').waitFor();
    const row = (await gateway.readTab('37_CHARACTER_STATE', { bypass: true })).rows.find(
      (r) => r.primaryKeyValue === `${userId}|var`,
    );
    check(
      `naming ${tag}: name (free text) and canonical gender persisted`,
      row?.raw.personal_name === 'Preview Name' && row?.raw.selected_gender === 'female',
      row?.raw,
    );
    await page.screenshot({ path: path.join(out, `naming-saved-${locale}-${viewportName}.png`) });
    await tid('naming-continue').click();
    await page.locator('[data-testid="world-experience"]').waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-testid="world-experience"]').waitFor();
    check(
      `naming ${tag}: after reload the saved naming resumes at the world, not the prompt`,
      (await tid('naming-prompt').count()) === 0,
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, `FAILURE-naming-${locale}-${viewportName}.png`) })
      .catch(() => undefined);
    check(
      `naming ${tag}: completed without an exception`,
      false,
      String(error.message).split('\n')[0],
    );
  } finally {
    await browser.close();
    server.close();
  }
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('mobile', { width: 393, height: 852 }, true);
for (const locale of ['en', 'ar-EG']) {
  await runNaming('desktop', { width: 1440, height: 900 }, false, locale);
  await runNaming('mobile', { width: 393, height: 852 }, true, locale);
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(
  path.join(out, 'browser-results.json'),
  JSON.stringify(
    { passed: results.length - failed.length, failed: failed.length, results },
    null,
    2,
  ),
);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
