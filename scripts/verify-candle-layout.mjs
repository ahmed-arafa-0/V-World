/* global document */
import fs from 'node:fs';
import { chromium, firefox, expect } from '@playwright/test';
import { startPhase2Fixture, seedPhase1Player } from './lib/phase2-fixture.mjs';
const out = 'test-results/candle-review-repair';
const fixture = await startPhase2Fixture({ artPack: true });
const user = 'candle_layout_fixture';
const session = await seedPhase1Player(fixture.gateway, user);
// Only the in-memory fixture is prepared for visual capacity tests. No live player is seeded.
await fixture.gateway.appendRow('24_PLAYER_PROGRESS', {
  user_route_key: `${user}|first_journey`,
  user_id: user,
  story_route_id: 'first_journey',
  status: 'completed',
  first_journey_completed: 'TRUE',
  map_unlocked: 'TRUE',
  current_location: 'church',
});
const existing = await fixture.gateway.findByPrimaryKey('10_ASSETS', 'church_candle_corner_scene');
const asset = {
  asset_id: 'church_candle_corner_scene',
  asset_type: 'image',
  drive_file_id: 'fixture-desktop.png',
  mobile_drive_file_id: 'fixture-mobile.png',
  enabled: 'TRUE',
  version: '1',
};
if (existing)
  await fixture.gateway.updateByPrimaryKey('10_ASSETS', 'church_candle_corner_scene', asset);
else await fixture.gateway.appendRow('10_ASSETS', asset);
const results = [];
try {
  for (const [engineName, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch();
    try {
      for (const [view, size] of [
        ['desktop', { width: 1440, height: 900 }],
        ['portrait', { width: 390, height: 844 }],
      ]) {
        const context = await browser.newContext({ viewport: size });
        await context.addCookies([
          { name: 'vw_owner_session', value: session, domain: '127.0.0.1', path: '/' },
        ]);
        // Supply the exact registered paintings from disk for this isolated visual test.
        await context.route('**/api/media/church_candle_corner_scene?*', (route) =>
          route.fulfill({
            path: `assets/Veoulla_Church_Candle_Patch/images/church_candle_corner_scene_${route.request().url().includes('variant=mobile') ? 'mobile' : 'desktop'}_v1.png`,
            contentType: 'image/png',
          }),
        );
        const page = await context.newPage();
        for (const count of [5, 6, 10]) {
          const key = `${user}|world_church`;
          const patch = {
            story_flags_json: JSON.stringify({
              visited: true,
              candleCustomized: true,
              candlePresent: Array.from({ length: count }, (_, i) => `candle_${i + 1}`),
            }),
          };
          if (await fixture.gateway.findByPrimaryKey('37_CHARACTER_STATE', key))
            await fixture.gateway.updateByPrimaryKey('37_CHARACTER_STATE', key, patch);
          else
            await fixture.gateway.appendRow('37_CHARACTER_STATE', {
              user_character_key: key,
              user_id: user,
              character_id: 'world_church',
              ...patch,
            });
          await page.goto(fixture.origin);
          // Free fixture starts in the Cottage: navigate to the Church via its Map marker.
          if (!(await page.getByTestId('church-candle-corner').isVisible())) {
            await page.getByTestId('open-map').click();
            await page.getByTestId('map-pin-church').click();
          }
          await page.getByTestId('church-candle-corner').click();
          await expect(page.locator('[data-testid^="candle-group-"]')).toHaveCount(count);
          await expect
            .poll(() =>
              page
                .getByTestId('stage-painting')
                .evaluate((img) => img.complete && img.naturalWidth > 0),
            )
            .toBe(true);
          const geometry = await page.evaluate(() => {
            const painting = document.querySelector('[data-testid="stage-painting"]');
            const p = painting.getBoundingClientRect();
            return {
              plane: { x: p.x, y: p.y, w: p.width, h: p.height },
              natural: [painting.naturalWidth, painting.naturalHeight],
              bases: [...document.querySelectorAll('[data-testid^="candle-group-"]')].map((n) => {
                const b = n.getBoundingClientRect();
                const img = n.querySelector('img').getBoundingClientRect();
                return { x: b.x, y: b.y, foot: img.width / 2 };
              }),
            };
          });
          const polygon =
            view === 'desktop'
              ? { backY: 57.6, frontY: 66.1, backL: 25.7, backR: 74.2, frontL: 20.2, frontR: 80 }
              : { backY: 57.1, frontY: 60.5, backL: 21.8, backR: 78.9, frontL: 17, frontR: 84.7 };
          for (const b of geometry.bases) {
            const p = geometry.plane,
              x = ((b.x - p.x) / p.w) * 100,
              y = ((b.y - p.y) / p.h) * 100,
              half = (b.foot / p.w) * 100;
            const t = (y - polygon.backY) / (polygon.frontY - polygon.backY);
            expect(t).toBeGreaterThan(0);
            expect(t).toBeLessThan(1);
            expect(x - half).toBeGreaterThan(polygon.backL + (polygon.frontL - polygon.backL) * t);
            expect(x + half).toBeLessThan(polygon.backR + (polygon.frontR - polygon.backR) * t);
            expect(b.x - b.foot).toBeGreaterThan(0);
            expect(b.x + b.foot).toBeLessThan(size.width);
          }
          await page.screenshot({ path: `${out}/layout-${engineName}-${view}-${count}.png` });
          results.push({ engineName, view, count, ...geometry });
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log(
    `PASS ${results.length} layouts: five, default six, maximum ten; desktop/portrait Chromium/Firefox; every whole foot inside sand and viewport.`,
  );
} finally {
  fs.writeFileSync(`${out}/layout-results.json`, JSON.stringify(results, null, 2));
  fixture.server.close();
}
