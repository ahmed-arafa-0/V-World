/** Focused release QA. Only newly minted isolated identities may be mutated. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  reviewRequest,
  setBirthdayScenario,
} from './review-support/birthday-review.mjs';
import { mutateWorldDoc } from '../apps/functions/lib/world/state.js';
import { KeyMutex } from '../apps/functions/lib/repositories/key-mutex.js';
const out = 'test-results/release';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [name, viewport, locale] of [
    ['desktop', { width: 1280, height: 900 }, 'en'],
    ['portrait', { width: 390, height: 844 }, 'ar-EG'],
  ]) {
    const prepared = await prepareBirthdayReviewer({
      manifestPath: `${out}/${name}-manifest.json`,
    });
    const { manifest, source } = prepared;
    const { server, origin, gateway } = await startBirthdayServer({
      ...prepared,
      port: 0,
      birthdayOnly: false,
    });
    source.setTtlSeconds(90);
    const ctx = { gateway, userId: manifest.userId, now: new Date(), mutex: new KeyMutex() };
    await mutateWorldDoc(ctx, 'cafe', (doc) => {
      doc.walkmanUnlocked = true;
    });
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
    page.setDefaultTimeout(45000);
    page.on('response', async (response) => {
      if (response.status() >= 400 && response.url().includes('/api/'))
        console.log(
          'API failure',
          new URL(response.url()).pathname,
          response.status(),
          (await response.json().catch(() => ({}))).code,
        );
    });
    const api = (route, body) =>
      reviewRequest(origin, manifest, `/api/world/${route}`, body === undefined ? {} : { body });
    const decoded = async () =>
      page.waitForFunction(
        () => [...globalThis.document.images].every((i) => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 60000 },
      );
    const shot = async (label) => {
      await decoded();
      await page.screenshot({ path: `${out}/${name}-${label}.png` });
    };
    const selectedRows = async (tab) =>
      (await source.readTab(tab, { bypass: true, strict: true })).rows
        .filter((r) => r.raw.user_id === manifest.userId)
        .map((r) => r.raw);
    try {
      await page.goto(origin);
      await page.getByTestId('cottage-interior').waitFor();
      if (locale !== 'en') await page.getByTestId(`flag-${locale}`).click();
      await decoded();
      const hint = await page.getByTestId('companion-hint-button').boundingBox();
      assert.ok(hint.width <= 40 && hint.height <= 40);
      await shot('cottage');
      console.log(`${name}: loaded Cottage; hint is compact.`);
      await api('marcelino/first-delivery', {});
      await api('mailbox/deliver', {});
      await page.reload();
      await page.getByTestId('cottage-interior').waitFor();
      await page.getByTestId('cottage-mailbox').click();
      await expect(page.locator('[data-testid^="mail-open-"]')).toHaveCount(3);
      await page.getByTestId('mail-open-vw_msg_morning_002_ar').click();
      await expect(page.getByTestId('mailbox-panel')).toContainText(
        locale === 'ar-EG' ? 'عرفة' : 'Arafa',
      );
      await page.getByTestId('message-back').click();
      await shot('mail-archive');
      await page.getByTestId('mailbox-panel-close').click();
      console.log(`${name}: three eligible letters including archive verified.`);
      await page.getByTestId('walkman').click();
      await expect(page.locator('[data-testid^="walkman-track-"]')).toHaveCount(2);
      for (const id of ['song_tul8te_001', 'song_henry_moodie_001']) {
        await page.getByTestId(`walkman-track-${id}`).click();
        await page.waitForFunction(() => {
          const a = globalThis.document.querySelector('[data-testid="walkman-audio"]');
          return a && !a.paused && a.currentTime > 0.2 && a.readyState >= 2;
        });
      }
      await shot('two-playing-songs');
      await page.getByTestId('walkman-panel-close').click();
      console.log(`${name}: both actual song files played.`);
      const keysBefore = await selectedRows('25_PLAYER_KEYS');
      const progressBefore = await selectedRows('24_PLAYER_PROGRESS');
      let previous = 'cottage';
      for (const id of ['beach', 'church', 'cafe', 'arcade', 'cottage', 'farm', 'museum']) {
        await page.getByTestId('open-map').click();
        await page.getByTestId(`map-pin-${id}`).waitFor();
        await expect(page.getByTestId('map-avatar')).toHaveAttribute('data-at', previous);
        if (id === 'beach') await shot('map');
        await page.getByTestId(`map-pin-${id}`).click();
        await expect(page.getByTestId('world-experience')).toHaveAttribute('data-place', id, {
          timeout: 45000,
        });
        if (id === 'beach') {
          await expect(page.locator('[data-node-id="beach_steps"]')).toBeVisible();
          await shot('sea');
        }
        previous = id;
        console.log(`${name}: destination ${id} verified.`);
      }
      assert.deepEqual(
        await selectedRows('25_PLAYER_KEYS'),
        keysBefore,
        'Map navigation never rewards',
      );
      const strip = (r) =>
        r.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(
              ([key]) => !['current_location', 'updated_at'].includes(key),
            ),
          ),
        );
      assert.deepEqual(
        strip(await selectedRows('24_PLAYER_PROGRESS')),
        strip(progressBefore),
        'Map navigation never completes story',
      );
      await page.getByTestId('open-map').click();
      await page.getByTestId('map-pin-church').click();
      await page.getByTestId('church-verse').click();
      await expect(page.getByTestId('church-text')).not.toBeEmpty();
      await shot('church-verse');
      await page.getByTestId('church-verse-panel-close').click();
      await page.getByTestId('church-story').click();
      await expect(page.getByTestId('church-story-panel').locator('img')).toHaveCount(1);
      await shot('church-story');
      await page.getByTestId('church-story-panel-close').click();
      await page.getByTestId('church-quiz').click();
      await page.getByTestId('quiz-question').waitFor();
      await page.locator('[data-testid^="quiz-option-"]').first().click();
      await page.getByTestId('quiz-feedback').waitFor();
      await shot('church-quiz');
      await page.getByTestId('church-quiz-panel-close').click();
      await page.getByTestId('church-candle-corner').click();
      assert.equal(await page.getByTestId('church-mute-audio').count(), 0);
      assert.equal(await page.getByTestId('church-reading-enable-audio').count(), 0);
      assert.ok(await page.getByTestId('walkman-audio').evaluate((a) => a.paused));
      assert.equal((await api('church')).gospelReadingAudioRef, null);
      await page.getByTestId('open-map').click();
      await page.getByTestId('map-pin-cottage').click();
      await page.getByTestId('cottage-interior').waitFor();
      await setBirthdayScenario(origin, manifest, 'final20');
      await page.getByTestId('birthday-celebrate-now').click();
      await page.getByTestId('birthday-reveal-step').waitFor();
      await expect(page.getByTestId('birthday-confetti').locator('span')).toHaveCount(40);
      await page.getByTestId('birthday-continue-reveal').click();
      await shot('birthday-garden');
      await page.getByTestId('birthday-continue-garden').click();
      await page.waitForFunction(async () => {
        const refs = [
          ...globalThis.document.querySelectorAll('[data-testid="birthday-cake"] image'),
        ].map((i) => i.getAttribute('href'));
        await Promise.all(
          refs.map(
            (src) =>
              new Promise((resolve, reject) => {
                const i = new globalThis.Image();
                i.onload = resolve;
                i.onerror = reject;
                i.src = src;
              }),
          ),
        );
        return true;
      });
      await expect(page.locator('[data-testid^="birthday-flame-"]')).toHaveCount(3);
      await shot('birthday-candles-lit');
      await page.getByTestId('birthday-candle').click();
      await expect(page.locator('[data-testid^="birthday-flame-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid^="birthday-candle-"]')).toHaveCount(3);
      await shot('birthday-candles-out');
      await page.getByTestId('birthday-continue-cake').click();
      await page.getByTestId('birthday-continue-letter').click();
      await page.getByTestId('birthday-gifts-claim').click();
      await page.getByTestId('birthday-gifts-claimed').waitFor();
      await expect(page.getByTestId('birthday-confetti').locator('span')).toHaveCount(40);
      await page.getByTestId('birthday-continue-gifts').click();
      await expect(page.getByTestId('birthday-gifts-step')).toHaveCount(0);
      assert.equal(await page.getByTestId('birthday-complete-step').count(), 0);
      assert.equal(await page.getByTestId('birthday-confetti').count(), 0);
      const afterGifts = await api('birthday');
      assert.ok(afterGifts.stage.completedAt && afterGifts.stage.giftsClaimed);
      const rewardRows = await selectedRows('26_PLAYER_ACHIEV');
      await page.getByTestId('birthday-entry').click();
      await page.getByTestId('birthday-replay-countdown-only').click();
      await page.getByTestId('birthday-confetti').waitFor();
      await page.waitForTimeout(3000);
      await shot('replay-confetti');
      await page.getByTestId('birthday-replay-countdown-only-close').click();
      assert.equal(await page.getByTestId('birthday-confetti').count(), 0);
      assert.deepEqual(await selectedRows('26_PLAYER_ACHIEV'), rewardRows);
      assert.deepEqual(
        (await api('birthday')).stage,
        afterGifts.stage,
        'Countdown replay is read-only',
      );
      for (const icon of ['/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png'])
        assert.equal((await fetch(origin + icon)).status, 200);
      results.push({
        name,
        userId: manifest.userId,
        passed: true,
        destinations: 7,
        songsPlayed: 2,
        churchQuizQuestions: (await api('church')).quiz.questions.length,
        mailboxMessages: (await api('cottage')).messages.length,
      });
      console.log(`${name}: all targeted live checks passed.`);
    } finally {
      await context.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(`${out}/live-results.json`, JSON.stringify(results, null, 2));
}
