#!/usr/bin/env node
/* global document, window */
/**
 * Player-visible journey polish check: plays Gate → doors → Beach → naming →
 * Beach → Church → junction (Church / Café / ahead) in a real browser against
 * the SAMPLE-content fixture (in-memory Sheet/Drive; never the live Sheet or
 * the real owner). Usage: node scripts/verify-journey-polish.mjs <label>
 * Screenshots go to docs/reports/JOURNEY_POLISH/<label>/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startPhase2Fixture, M02_FAKE_GATE_CODE } from './lib/phase2-fixture.mjs';

const label = process.argv[2] ?? 'after';
const out = path.resolve('docs/reports/JOURNEY_POLISH', label);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function run(vpName, viewport, mobile) {
  console.log(`\n=== ${vpName} ===`);
  const { server, origin } = await startPhase2Fixture();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let n = 0;
  const shot = async (name) => {
    await page.waitForTimeout(700);
    n += 1;
    const file = `${String(n).padStart(2, '0')}-${name}-${vpName}.png`;
    await page.screenshot({ path: path.join(out, file) });
    const info = await page.evaluate(() => ({
      testids: [...document.querySelectorAll('[data-testid]')].map((e) =>
        e.getAttribute('data-testid'),
      ),
      buttons: [...document.querySelectorAll('button')].map(
        (b) => b.textContent?.trim() || b.getAttribute('aria-label'),
      ),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    console.log(`  [${file}] buttons=${JSON.stringify(info.buttons)} overflow=${info.overflow}`);
    return info;
  };
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await shot('black-opening');
    await tid('pre-gate-continue').click();
    await shot('title');
    await tid('pre-gate-continue').click();
    const unseen = await shot('gate-unseen');
    check(
      `${vpName}: unseen phase dialogue`,
      unseen.testids.includes('dialogue-text'),
      'dlg_gate_01 present?',
    );
    await tid('pre-gate-continue').click();
    await shot('var-reveal');
    await tid('pre-gate-continue').click();
    await shot('gate-dials');
    await page.keyboard.type(M02_FAKE_GATE_CODE);
    await page.keyboard.press('Enter');
    await tid('doors-opening-continue').waitFor({ timeout: 15000 });
    await shot('doors-opening');
    await page.waitForTimeout(3000);
    await shot('doors-opening-late');
    await tid('doors-opening-continue').click();
    await tid('beach-arrival-continue').waitFor({ timeout: 15000 });
    await shot('beach-arrival');
    // Resumed session: a reload after the doors must land on the Beach arrival, not replay the doors.
    await page.reload({ waitUntil: 'networkidle' });
    await tid('beach-arrival-continue').waitFor({ timeout: 15000 });
    check(
      `${vpName}: resume after doors lands on Beach arrival`,
      (await tid('doors-opening-transition').count()) === 0,
    );
    await tid('beach-arrival-continue').click();
    await page.waitForTimeout(800);
    // Resumed session at the naming beat: still asks for the name, still no collar.
    await page.reload({ waitUntil: 'networkidle' });
    await tid('naming-name-input').waitFor({ timeout: 15000 });
    check(
      `${vpName}: resume at naming still shows input, no collar`,
      (await tid('naming-character-collar').count()) === 0,
    );
    const naming = await shot('naming');
    check(
      `${vpName}: name input shown before collar`,
      naming.testids.includes('naming-name-input'),
    );
    check(
      `${vpName}: no collar before naming`,
      !naming.testids.includes('naming-character-collar'),
    );
    await tid('naming-submit').click();
    await page.waitForTimeout(400);
    await shot('naming-validation');
    await tid('naming-name-input').fill('Sample Name');
    await tid('naming-gender-female').check();
    await tid('naming-submit').click();
    await tid('naming-continue').waitFor({ timeout: 15000 });
    await shot('naming-collar');
    await tid('naming-continue').click();
    await tid('world-experience').waitFor({ timeout: 15000 });
    await page.reload({ waitUntil: 'networkidle' });
    await tid('world-experience').waitFor({ timeout: 15000 });
    check(
      `${vpName}: resume after naming goes straight to the world`,
      (await tid('naming-name-input').count()) === 0,
    );
    await page.waitForTimeout(800);
    await shot('beach-world');
    for (const node of ['beach_steps', 'steps_church_approach', 'church_focus']) {
      await tid('walk-forward').click();
      await tid(`scene-stage-${node}`).waitFor({ timeout: 15000 });
      await page.waitForTimeout(900);
      await shot(node);
    }
    const church = await shot('church-focus');
    const road = tid('marker-road_onward');
    const box = await road.boundingBox();
    const vp = page.viewportSize();
    check(
      `${vpName}: road control fully on screen with a visible caption`,
      !!box &&
        box.x >= 0 &&
        box.x + box.width <= vp.width &&
        box.y + box.height <= vp.height &&
        (await tid('marker-caption-road_onward').isVisible()),
      JSON.stringify(box),
    );
    check(`${vpName}: church entrance also offered`, church.testids.includes('marker-church_door'));
    const toJunction = async () => {
      await tid('marker-road_onward').click({ timeout: 8000 });
      await tid('junction').waitFor({ timeout: 15000 });
    };
    await toJunction();
    await shot('junction');
    for (const choice of ['church', 'cafe', 'ahead']) {
      // Reload resumes at the Church approach checkpoint, so each choice starts from the same place.
      await page.reload({ waitUntil: 'networkidle' });
      await tid('marker-road_onward').waitFor({ timeout: 15000 });
      await toJunction();
      await tid(`junction-${choice}`).click({ force: true, timeout: 8000 }); // aria-disabled locked choices stay clickable so the reason can be explained
      await page.waitForTimeout(700);
      const explained = (await tid('junction-explain').count()) > 0;
      const place = await tid('world-experience').getAttribute('data-place');
      const detail = explained
        ? await tid('junction-explain-text').textContent()
        : `opened ${place}`;
      await shot(`junction-${choice}-${explained ? 'locked-explained' : place}`);
      check(
        `${vpName}: junction ${choice} opens or explains why not`,
        explained || place !== 'junction',
        detail,
      );
    }
  } catch (e) {
    check(`${vpName}: journey reached its end`, false, String(e).split('\n')[0]);
    await shot('failure');
  } finally {
    check(`${vpName}: no page errors`, errors.length === 0, errors.join(' | '));
    await browser.close();
    server.close();
  }
}

await run('desktop', { width: 1600, height: 900 }, false);
await run('mobile', { width: 390, height: 844 }, true);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
