import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
} from './review-support/birthday-review.mjs';
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['portrait', { width: 390, height: 844 }],
  ]) {
    const prepared = await prepareBirthdayReviewer({
      manifestPath: `test-results/release/${name}-manifest.json`,
    });
    const { server, origin } = await startBirthdayServer({
      ...prepared,
      port: 0,
      birthdayOnly: false,
    });
    prepared.source.setTtlSeconds(90);
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      {
        name: 'vw_owner_session',
        value: prepared.manifest.ownerSessionId,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    try {
      await page.goto(origin);
      await page.getByTestId('cottage-interior').waitFor();
      await page.waitForFunction(() =>
        [...globalThis.document.images].every((i) => i.complete && i.naturalWidth > 0),
      );
      if (await page.getByTestId('delivery-panel-close').count())
        await page.getByTestId('delivery-panel-close').click();
      await page.screenshot({ path: `test-results/release/${name}-cottage-final.png` });
      const badge = page.getByTestId('cottage-mailbox').locator('span');
      if (await badge.count()) assert.ok((await badge.last().boundingBox()).width < 45);
      await page.getByTestId('open-map').click();
      await page.getByTestId('map-pin-cottage').waitFor();
      await expect(page.getByTestId('map-avatar')).toHaveAttribute('data-at', 'cottage');
      await page.waitForFunction(() => {
        const image = globalThis.document.querySelector('[data-testid="map-avatar"]');
        return image.complete && image.naturalWidth > 0;
      });
      await page.waitForFunction(
        () => [...globalThis.document.images].every((i) => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 60000 },
      );
      await page.screenshot({ path: `test-results/release/${name}-map-final.png` });
      const avatar = await page.getByTestId('map-avatar').boundingBox();
      assert.ok(avatar.height >= 30 && avatar.height <= 75);
      const grounded = await page.evaluate(() => {
        const island = globalThis.document.querySelector('[data-testid="map-island"]');
        const avatar = globalThis.document
          .querySelector('[data-testid="map-avatar"]')
          .getBoundingClientRect();
        const plane = island.getBoundingClientRect();
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = island.naturalWidth;
        canvas.height = island.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(island, 0, 0);
        return (
          ctx.getImageData(
            Math.floor(((avatar.x + avatar.width / 2 - plane.x) / plane.width) * canvas.width),
            Math.floor(((avatar.bottom - plane.y) / plane.height) * canvas.height),
            1,
            1,
          ).data[3] > 128
        );
      });
      assert.ok(grounded, 'Avatar feet land on the opaque island, never transparent ocean padding');
      for (const pin of await page.locator('[data-testid^="map-pin-"]').all()) {
        const box = await pin.boundingBox();
        assert.ok(
          avatar.x + avatar.width <= box.x ||
            box.x + box.width <= avatar.x ||
            avatar.y + avatar.height <= box.y ||
            box.y + box.height <= avatar.y,
          'Avatar clears destination controls',
        );
      }
      if (process.argv.includes('--map-only')) {
        console.log(`${name}: final map artwork decoded and avatar clears controls.`);
        continue;
      }
      await page.getByTestId('map-pin-cottage').click();
      await page.getByTestId('cottage-interior').waitFor();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setBirthdayScenario(origin, prepared.manifest, 'live');
      await page.getByTestId('birthday-entry').click();
      await page.getByTestId('birthday-replay-celebration').click();
      await page.getByTestId('birthday-confetti-reduced').waitFor();
      assert.equal(await page.getByTestId('birthday-confetti').count(), 0);
      await page.getByTestId('birthday-continue-reveal').click();
      await page.getByTestId('birthday-skip').click();
      await page.getByTestId('birthday-continue-letter').click();
      await page.getByTestId('birthday-continue-gifts').click();
      await expect(page.getByTestId('birthday-confetti-reduced')).toHaveCount(0, {
        timeout: 45000,
      });
      console.log(
        `${name}: final cat/mail badge and visible map avatar clear controls; reduced-motion celebration closes cleanly.`,
      );
    } finally {
      await context.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
} finally {
  await browser.close();
}
