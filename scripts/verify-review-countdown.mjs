/* global window, getComputedStyle */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, firefox, expect } from '@playwright/test';
import { startPhase2Fixture, seedPhase1Player } from './lib/phase2-fixture.mjs';
const out = 'test-results/review-repair';
const fixture = await startPhase2Fixture({ artPack: true });
const user = 'countdown_layout_fixture';
const session = await seedPhase1Player(fixture.gateway, user);
await fixture.gateway.appendRow('24_PLAYER_PROGRESS', {
  user_route_key: `${user}|first_journey`,
  user_id: user,
  story_route_id: 'first_journey',
  status: 'completed',
  first_journey_completed: 'TRUE',
  map_unlocked: 'TRUE',
});
const results = [];
try {
  for (const [browserName, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = browserName === 'chromium' ? await engine.launch() : null;
    try {
      for (const [name, size] of [
        ['desktop', { width: 1440, height: 900 }],
        ['portrait', { width: 393, height: 852 }],
        ['landscape', { width: 852, height: 393 }],
      ]) {
        for (const zoom of [1, 0.9]) {
          let context;
          if (browserName === 'firefox') {
            const profile = `${out}/zoom-profile-${name}-${zoom}-${Date.now()}`;
            fs.mkdirSync(profile, { recursive: true });
            // Firefox's native per-site full zoom, in a disposable test profile only.
            execFileSync('python', [
              '-c',
              `import sqlite3,sys,time
c=sqlite3.connect(sys.argv[1]+'/content-prefs.sqlite')
c.executescript('CREATE TABLE groups (id INTEGER PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE settings (id INTEGER PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE prefs (id INTEGER PRIMARY KEY,groupID INTEGER,settingID INTEGER NOT NULL,value BLOB,timestamp INTEGER NOT NULL DEFAULT 0); PRAGMA user_version=6;')
c.execute("INSERT INTO groups VALUES(1,'127.0.0.1')")
c.execute("INSERT INTO settings VALUES(1,'browser.content.full-zoom')")
c.execute('INSERT INTO prefs VALUES(1,1,1,?,?)',(float(sys.argv[2]),int(time.time())))
c.commit()`,
              profile,
              String(zoom),
            ]);
            context = await firefox.launchPersistentContext(profile, {
              headless: true,
              viewport: null,
              env: { ...process.env, MOZ_HEADLESS_WIDTH: '1920', MOZ_HEADLESS_HEIGHT: '1200' },
            });
          } else
            context = await browser.newContext({
              viewport: {
                width: Math.round(size.width / zoom),
                height: Math.round(size.height / zoom),
              },
            });
          await context.addCookies([
            { name: 'vw_owner_session', value: session, domain: '127.0.0.1', path: '/' },
          ]);
          let page;
          if (browserName === 'firefox') {
            const opened = context.waitForEvent('page');
            await context.pages()[0].evaluate(({ width, height }) => {
              window.open('about:blank', 'countdownZoom', `width=${width},height=${height}`);
            }, size);
            page = await opened;
          } else page = await context.newPage();
          await page.goto(fixture.origin);
          if (browserName === 'firefox') {
            await expect
              .poll(async () =>
                Math.abs((await page.evaluate(() => window.devicePixelRatio)) - zoom),
              )
              .toBeLessThan(0.02);
          }
          const actualScale = await page.evaluate(() => window.devicePixelRatio);
          if (browserName === 'firefox' && Math.abs(actualScale - zoom) > 0.02)
            throw Error(`Native zoom not applied: ${actualScale}`);
          await expect(page.getByTestId('mantel-seconds')).toBeVisible();
          await expect(page.getByTestId('stage-painting').first()).toHaveAttribute(
            'data-paint',
            'ready',
          );
          for (const locale of ['en', 'ar-EG', 'it', 'el', 'fr']) {
            const language = page.getByTestId(`language-${locale}`);
            if (await language.count()) await language.press('Enter');
            await page.waitForTimeout(100);
            const metrics = await page
              .locator('[data-testid^="mantel-unit-"]')
              .evaluateAll((labels) =>
                labels.map((label) => {
                  const field = label.parentElement.getBoundingClientRect(),
                    box = label.getBoundingClientRect();
                  return {
                    label: label.textContent,
                    fits:
                      box.left >= field.left - 1 &&
                      box.right <= field.right + 1 &&
                      box.bottom <= field.bottom + 1,
                    font: getComputedStyle(label).fontSize,
                  };
                }),
              );
            if (metrics.some((m) => !m.fits))
              throw Error(JSON.stringify({ browserName, name, zoom, locale, metrics }));
            results.push({ browserName, name, zoom, actualScale, locale, metrics });
            if (locale === 'en' || locale === 'ar-EG')
              await page.screenshot({
                path: `${out}/countdown-${browserName}-${name}-${zoom}-${locale}.png`,
              });
          }
          await page.getByTestId('mantel-days').press('Enter');
          await expect(page.getByTestId('countdown-panel')).toBeVisible();
          await context.close();
        }
      }
    } finally {
      await browser?.close();
    }
  }
} finally {
  fixture.server.close();
  fs.writeFileSync(`${out}/countdown-results.json`, JSON.stringify(results, null, 2));
}
console.log(
  `PASS ${results.length} browser/viewport/scale/locale layout checks; Firefox uses native per-site 90%/100% zoom; Chromium 90% uses equivalent CSS viewport.`,
);
