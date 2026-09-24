import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
const userId = 'manual_review_1790065059494';
const origin = 'http://localhost:5051';
const out = 'test-results/candle-review-repair';
const gateway = getProductionGatewayOrNull();
const session = (await gateway.readTab('06_SESSIONS')).rows
  .filter(
    (r) =>
      r.raw.user_id === userId &&
      r.raw.status === 'active' &&
      Date.parse(r.raw.expires_at) > Date.now(),
  )
  .at(-1);
if (!session) throw Error('Review session unavailable; no identity created.');
const identity = await fetch(origin);
expect(identity.headers.get('x-review-player')).toBe(userId);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  {
    name: 'vw_owner_session',
    value: session.primaryKeyValue,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  },
]);
const page = await context.newPage();
const evidence = [];
async function returnToCorner() {
  await page.getByTestId('world-experience').waitFor();
  await expect(
    page.getByTestId('place-title').or(page.getByTestId('marker-church_door')),
  ).toBeVisible({ timeout: 20000 });
  if (await page.getByTestId('cottage-back').isVisible()) {
    // The delivery dialog has no working Close. Use the page's existing keyboard Back control;
    // this only navigates this test tab to an already-accessible place, without completing anything.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (
        await page.getByTestId('cottage-back').evaluate((n) => n === n.ownerDocument.activeElement)
      )
        break;
    }
    await expect(page.getByTestId('cottage-back')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  if (await page.getByTestId('arcade-back').isVisible()) {
    await page.getByTestId('arcade-back').click();
    await page.getByTestId('junction-church').click();
  }
  if (await page.getByTestId('cafe-back').isVisible()) {
    await page.getByTestId('cafe-back').click();
    await page.getByTestId('junction-church').click();
  }
  await page.getByTestId('marker-church_door').click();
  await page.getByTestId('church-candle-corner').click();
}
page.on('response', async (r) => {
  if (/\/api\/(world|session\/owner)/.test(r.url())) {
    const body = await r.json().catch(() => null);
    evidence.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      request: r.headers()['x-review-request'],
      elapsedMs: r.request().timing().responseEnd,
      body,
    });
  }
});
page.on('requestfailed', (r) => {
  if (r.url().includes('/api/'))
    evidence.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText });
});
try {
  await page.goto(origin);
  await page.waitForTimeout(8000);
  if (process.argv.includes('--inspect')) {
    console.log((await page.locator('body').innerText()).slice(-2000));
    console.log(
      await page
        .locator('[data-testid]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid'))),
    );
  }
  if (process.argv.includes('--portrait')) {
    await page.setViewportSize({ width: 390, height: 844 });
    await returnToCorner();
    await expect
      .poll(
        () =>
          page
            .getByTestId('stage-painting')
            .evaluate(
              (img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth,
            ),
        { timeout: 60000 },
      )
      .toBe(true);
    console.log(
      await page.getByTestId('stage-painting').evaluate((img) => ({
        src: img.currentSrc,
        natural: [img.naturalWidth, img.naturalHeight],
        style: img.getAttribute('style'),
        source: img.parentElement.innerHTML.slice(0, 220),
      })),
    );
    await page.screenshot({ path: `${out}/corrected-portrait.png` });
  }
  if (!process.argv.includes('--fixed')) await page.screenshot({ path: `${out}/live-before.png` });
  if (process.argv.includes('--reproduce')) {
    await page.getByTestId('marker-church_door').click();
    await page.getByTestId('church-candle-corner').click();
    await page.waitForTimeout(4000);
    await page.getByTestId('candle-candle_3').click();
    await page.waitForTimeout(35000);
    await page.screenshot({ path: `${out}/original-candle-failure.png` });
  }
  if (process.argv.includes('--fixed')) {
    await returnToCorner();
    const candle = page.getByTestId('candle-candle_3');
    await expect(candle).toBeEnabled({ timeout: 20000 });
    const action = async (testId, endpoint) => {
      const response = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/api/world/church/${endpoint}` &&
          r.request().method() === 'POST',
      );
      await page.getByTestId(testId).click();
      const r = await response;
      expect(r.status()).toBe(200);
      const state = await r.json();
      await expect(page.getByTestId('candle-add')).toBeEnabled();
      return state;
    };
    // Reproduction already persisted candle_3. Exercise both effects through ordinary taps.
    expect(await candle.getAttribute('aria-pressed')).toBe('true');
    await action('candle-candle_3', 'candle/extinguish');
    await expect(candle).toHaveAttribute('aria-pressed', 'false');
    await action('candle-candle_3', 'candle');
    await expect(candle).toHaveAttribute('aria-pressed', 'true');
    const added = await action('candle-add', 'candle/add');
    const addedId = added.candles.slots.at(-1);
    await page.getByTestId(`candle-select-${addedId}`).click();
    const removed = await action('candle-remove', 'candle/remove');
    expect(removed.candles.slots).not.toContain(addedId);
    expect(removed.candles.slots.length).toBe(5);
    await page.getByTestId('church-candle-back').click();
    await page.getByTestId('church-candle-corner').click();
    await expect(candle).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${out}/corrected-desktop.png` });
    await page.reload();
    await returnToCorner();
    await expect(candle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid^="candle-group-"]')).toHaveCount(5);
    await page.screenshot({ path: `${out}/reload-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(
        () =>
          page
            .getByTestId('stage-painting')
            .evaluate(
              (img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth,
            ),
        { timeout: 60000 },
      )
      .toBe(true);
    await page.screenshot({ path: `${out}/corrected-portrait.png` });
    const authoritative = await context.request.get(`${origin}/api/world/church?fresh=1`);
    expect(authoritative.status()).toBe(200);
    const saved = await authoritative.json();
    expect(saved.candles.slots).toEqual(removed.candles.slots);
    expect(saved.candles.lit).toEqual(removed.candles.lit);
    const keys = await (await context.request.get(`${origin}/api/world/journey`)).json();
    fs.writeFileSync(
      `${out}/persistence-after.json`,
      JSON.stringify({ userId, saved, journey: keys }, null, 2),
    );
    console.log(
      'PASS same live player: extinguish/light/add/remove, corner reentry, reload, independent fresh authoritative read, desktop/portrait screenshots.',
    );
  }
} finally {
  fs.writeFileSync(
    `${out}/${process.argv.includes('--fixed') ? 'repaired' : process.argv.includes('--reproduce') ? 'original' : 'inspect'}-network.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    evidence
      .filter((e) => e.path.includes('/church'))
      .map((e) => ({
        path: e.path,
        status: e.status,
        request: e.request,
        elapsedMs: e.elapsedMs,
        code: e.body?.code,
      })),
  );
  await browser.close();
}
