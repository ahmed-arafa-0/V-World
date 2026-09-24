#!/usr/bin/env node
/** Strict real Sheet + Drive QA, one dedicated app and synthetic player per viewport. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
  reviewRequest,
} from './review-support/birthday-review.mjs';
import { getBirthdayState } from '../apps/functions/lib/world/birthday.js';
import { KeyMutex } from '../apps/functions/lib/repositories/key-mutex.js';
const OUT = path.resolve('test-results/birthday-review/verified');
const results = [];
async function decoded(page) {
  await page.waitForFunction(
    () => [...globalThis.document.images].every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 60000 },
  );
  await page.evaluate(async () => {
    await Promise.all([...globalThis.document.images].map((i) => i.decode()));
  });
}
const browser = await chromium.launch();
try {
  for (const [name, viewport, locale] of [
    ['desktop', { width: 1280, height: 900 }, 'en'],
    ['portrait', { width: 390, height: 844 }, 'ar-EG'],
  ]) {
    const prepared = await prepareBirthdayReviewer({
      userId: `manual_review_bday_art_${name}_${Date.now()}`,
      manifestPath: null,
    });
    const { manifest, source } = prepared;
    const { server, origin } = await startBirthdayServer({ ...prepared, port: 0 });
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      {
        name: 'vw_owner_session',
        value: manifest.ownerSessionId,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    const api = (route, body) =>
      reviewRequest(origin, manifest, `/api/world/${route}`, body === undefined ? {} : { body });
    const shot = async (file) => {
      await decoded(page);
      await page.screenshot({ path: path.join(dir, file) });
    };
    const rows = async (tab) =>
      (await source.readTab(tab, { bypass: true, strict: true })).rows
        .filter((r) => r.raw.user_id === manifest.userId)
        .map((r) => r.raw);
    try {
      await setBirthdayScenario(origin, manifest, 'before');
      await page.goto(origin);
      await page.getByTestId('world-experience').waitFor({ timeout: 60000 });
      if (locale !== 'en') await page.getByTestId(`flag-${locale}`).click();
      await page.getByTestId('cottage-interior').waitFor({ timeout: 30000 });
      await decoded(page);
      const progressBefore = await rows('24_PLAYER_PROGRESS');
      const keysBefore = await rows('25_PLAYER_KEYS');
      const originalLetters = (await source.readTab('19_MESSAGES')).rows.filter(
        (r) => r.raw.message_id === 'msg_birthday_2026',
      );
      for (const lang of ['en', 'ar-EG', 'it', 'el', 'fr']) {
        const state = await reviewRequest(origin, manifest, `/api/world/birthday?locale=${lang}`);
        const original = originalLetters.find((r) => r.raw.locale === lang);
        assert.ok(
          original && state.letter?.text === original.raw.text,
          `Approved ${lang} birthday letter must resolve exactly`,
        );
        assert.equal(state.letter.direction, lang === 'ar-EG' ? 'rtl' : 'ltr');
      }
      const unscoped = await getBirthdayState(
        { gateway: source, mutex: new KeyMutex(), userId: manifest.userId, now: new Date() },
        'en',
      );
      assert.equal(unscoped.letter, null, 'Production recipient checks stay intact');
      if (name === 'desktop') {
        await page.getByTestId('decor-decor_1').click();
        await page.getByTestId('decor-panel').waitFor();
        await setBirthdayScenario(origin, manifest, 'live');
        await page.waitForTimeout(5500); // One documented polling interval while the real modal is open.
        assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
        await setBirthdayScenario(origin, manifest, 'before');
        await page.getByTestId('decor-panel-close').click();
        await page.reload();
        await page.getByTestId('world-experience').waitFor();
        await decoded(page);
        await setBirthdayScenario(origin, manifest, 'final20');
        await page.getByTestId('birthday-celebrate-now').waitFor({ timeout: 15000 });
        await page.getByTestId('birthday-celebrate-now').click();
        await expect(page.getByTestId('birthday-countdown')).toHaveAttribute('data-mode', 'live');
        await shot('1-countdown-crossing.png');
      } else {
        await setBirthdayScenario(origin, manifest, 'late-arrival');
        await page.getByTestId('birthday-entry').waitFor({ timeout: 15000 });
        assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
        await page.getByTestId('birthday-entry').click();
        await page.getByTestId('birthday-celebrate-now').click();
      }
      await page.getByTestId('birthday-reveal-step').waitFor({ timeout: 30000 });
      if (name === 'desktop') assert.equal((await api('birthday')).window, 'live');
      await page.getByTestId('birthday-continue-reveal').click();
      await page.getByTestId('birthday-garden-step').waitFor();
      await shot('2-garden.png');
      const media = (await api('birthday')).media;
      const garden = await page
        .getByTestId('birthday-garden')
        .locator(':scope > img')
        .getAttribute('src');
      assert.equal(garden, name === 'portrait' ? media.gardenPortraitRef : media.gardenDesktopRef);
      assert.equal(await page.getByTestId('birthday-garden-cat').locator('img').count(), 1);
      assert.equal(await page.getByTestId('birthday-garden-marcelino').locator('img').count(), 1);
      await page.getByTestId('birthday-continue-garden').click();
      await shot('3-cake-lit.png');
      assert.equal(await page.locator('[data-testid^="birthday-flame-"]').count(), 3);
      await page.getByTestId('birthday-candle').click();
      await expect(page.locator('[data-testid^="birthday-flame-"]')).toHaveCount(0, {
        timeout: 30000,
      });
      for (let n = 1; n <= 3; n++)
        assert.equal(await page.getByTestId(`birthday-candle-${n}`).locator('img').count(), 1);
      await shot('4-three-unlit-candles.png');
      await page.getByTestId('birthday-wish-skip').click();
      await page.getByTestId('birthday-continue-cake').click();
      await page.getByTestId('birthday-letter-step').waitFor();
      const letterNode = page.getByTestId('birthday-letter-text');
      const rendered = await letterNode.textContent();
      assert.ok(
        rendered === originalLetters.find((r) => r.raw.locale === locale).raw.text,
        'Actual approved letter visible',
      );
      await expect(letterNode).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
      await shot('5-actual-letter.png');
      await page
        .getByTestId('birthday-letter-step')
        .locator('[role=dialog]')
        .evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
      await shot('5b-actual-letter-ending.png');
      await page.getByTestId('birthday-continue-letter').click();
      await page.getByTestId('birthday-gifts-claim').click();
      await page.getByTestId('birthday-gifts-claimed').waitFor({ timeout: 30000 });
      await shot('6-gifts-real-icon.png');
      await page.getByTestId('birthday-continue-gifts').click();
      await expect(page.getByTestId('birthday-gifts-step')).toHaveCount(0, { timeout: 30000 });
      await page.getByTestId('cottage-interior').waitFor();
      await page.getByTestId('decor-decor_1').click();
      await page.getByTestId('decor-place-birthday_cottage_decoration').click();
      await expect
        .poll(async () => (await api('cottage')).decor.placed.decor_1, { timeout: 30000 })
        .toBe('birthday_cottage_decoration');
      await page.reload();
      await page.getByTestId('cottage-interior').waitFor();
      await page.getByTestId('placed-decor-decor_1').waitFor({ timeout: 30000 });
      await shot('7-decoration-after-reload.png');
      assert.equal(
        await page.getByTestId('placed-decor-decor_1').getAttribute('src'),
        media.decorationRef,
      );
      await api('birthday/gifts/claim', {});
      await api('birthday/gifts/claim', {});
      assert.equal(
        (await rows('26_PLAYER_ACHIEV')).filter(
          (r) => r.achievement_id === 'birthday_2026_celebrated',
        ).length,
        1,
      );
      assert.equal(
        (await rows('27_PLAYER_MESSAGES')).filter((r) => r.message_id === 'msg_birthday_2026')
          .length,
        1,
      );
      assert.equal(
        (await api('cottage')).decor.owned.filter((x) => x === 'birthday_cottage_decoration')
          .length,
        1,
      );
      await page.getByTestId('birthday-entry').click();
      await page.getByTestId('birthday-replay-celebration').click();
      await page.getByTestId('birthday-reveal-step').waitFor();
      await page.getByTestId('birthday-continue-reveal').click();
      await page.getByTestId('birthday-continue-garden').click();
      await expect(page.getByTestId('birthday-candle')).toHaveAttribute('data-lit', 'true');
      await page.getByTestId('birthday-candle').click();
      await page.getByTestId('birthday-continue-cake').click();
      await page.getByTestId('birthday-continue-letter').click();
      assert.equal(await page.getByTestId('birthday-gifts-claim').count(), 0);
      await page.getByTestId('birthday-continue-gifts').click();
      await expect(page.getByTestId('birthday-gifts-step')).toHaveCount(0, { timeout: 30000 });
      const giftsBefore = await rows('26_PLAYER_ACHIEV');
      const birthdayBefore = (await api('birthday')).stage;
      let birthdayWrites = 0;
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().includes('/api/world/birthday')) birthdayWrites++;
      });
      await page.getByTestId('birthday-entry').click();
      await page.getByTestId('birthday-replay-countdown-only').click();
      await page.getByTestId('birthday-countdown-replay-step').waitFor();
      await shot('8-countdown-only-replay.png');
      await page.getByTestId('birthday-confetti').waitFor({ timeout: 25000 });
      await page.getByTestId('birthday-replay-countdown-only-close').click();
      assert.equal(birthdayWrites, 0);
      assert.deepEqual((await api('birthday')).stage, birthdayBefore);
      assert.deepEqual(await rows('26_PLAYER_ACHIEV'), giftsBefore);
      assert.deepEqual(await rows('25_PLAYER_KEYS'), keysBefore);
      assert.deepEqual(await rows('24_PLAYER_PROGRESS'), progressBefore);
      await setBirthdayScenario(origin, manifest, 'clear');
      assert.ok(Math.abs(Date.parse((await api('birthday')).serverNow) - Date.now()) < 10000);
      results.push({
        viewport: name,
        locale,
        userId: manifest.userId,
        passed: true,
        screenshots: dir,
        actualLetter: true,
        decodedArt: true,
        onceOnlyGifts: true,
        decorationPersists: true,
        countdownOnlyWrites: 0,
        ordinaryProgressUnchanged: true,
      });
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
      console.log(
        `PASS ${name}: real decoded art, approved ${locale} letter, three candle bodies, one-time gifts, placed decoration, full/countdown replay, unchanged ordinary progress.`,
      );
    } finally {
      await context.close();
      await new Promise((r) => server.close(r));
    }
  }
} finally {
  await browser.close();
}

process.exit(0);
