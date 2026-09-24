/** Reuse completed QA players to verify presentation fixes without minting fresh gameplay. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
  reviewRequest,
} from './review-support/birthday-review.mjs';
const results = JSON.parse(
  fs.readFileSync('test-results/birthday-review/verified/results.json', 'utf8'),
);
const browser = await chromium.launch();
try {
  for (const result of results) {
    const prepared = await prepareBirthdayReviewer({ userId: result.userId, manifestPath: null });
    const { server, origin } = await startBirthdayServer({ ...prepared, port: 0 });
    const context = await browser.newContext({
      viewport:
        result.viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 },
    });
    await context.addCookies([
      {
        name: 'vw_owner_session',
        value: prepared.manifest.ownerSessionId,
        url: origin,
        httpOnly: true,
      },
    ]);
    const page = await context.newPage();
    const shot = async (file) => {
      await page.waitForFunction(
        () => [...globalThis.document.images].every((i) => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 60000 },
      );
      await page.evaluate(async () => {
        await Promise.all([...globalThis.document.images].map((i) => i.decode()));
      });
      await page.screenshot({ path: `${result.screenshots}/${file}` });
    };
    try {
      await setBirthdayScenario(origin, prepared.manifest, 'live');
      await page.goto(origin);
      await page.getByTestId('world-experience').waitFor({ timeout: 60000 });
      if (result.locale !== 'en') await page.getByTestId(`flag-${result.locale}`).click();
      await page.getByTestId('placed-decor-decor_1').waitFor({ timeout: 30000 });
      await shot('7-decoration-after-reload.png');
      const state = await reviewRequest(
        origin,
        prepared.manifest,
        `/api/world/birthday?locale=${result.locale}`,
      );
      assert.equal(
        await page.getByTestId('placed-decor-decor_1').getAttribute('src'),
        state.media.decorationRef,
      );
      await page.getByTestId('birthday-entry').click();
      await page.getByTestId('birthday-replay-celebration').click();
      await page.getByTestId('birthday-continue-reveal').click();
      await shot('2-garden.png');
      await page.getByTestId('birthday-continue-garden').click();
      await shot('3-cake-lit.png');
      await page.getByTestId('birthday-candle').click();
      await shot('4-three-unlit-candles.png');
      await page.getByTestId('birthday-continue-cake').click();
      await expect(page.getByTestId('birthday-letter-text')).toHaveAttribute(
        'dir',
        result.locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
      assert.ok(
        (await page.getByTestId('birthday-letter-text').textContent()) === state.letter.text,
        'Approved letter unchanged',
      );
      const stacking = await page
        .getByTestId('birthday-letter-step')
        .evaluate(
          (node) =>
            node.parentElement === globalThis.document.body &&
            node.contains(globalThis.document.elementFromPoint(195, 30)),
        );
      assert.ok(stacking, 'Birthday modal must cover the global language controls');
      await shot('5-actual-letter.png');
      await page
        .getByTestId('birthday-letter-step')
        .locator('[role=dialog]')
        .evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
      await shot('5b-actual-letter-ending.png');
      await page.getByTestId('birthday-continue-letter').click();
      await shot('6-gifts-real-icon.png');
      result.placedDecorationArtDecoded = true;
      result.modalAboveGlobalControls = true;
      console.log(
        `PASS ${result.viewport}: placed gift artwork decoded; modal above language controls; real letter top/end screenshots.`,
      );
    } finally {
      await context.close();
      await new Promise((r) => server.close(r));
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(
  'test-results/birthday-review/verified/results.json',
  JSON.stringify(results, null, 2),
);
process.exit(0);
