#!/usr/bin/env node
/* global document */
/**
 * LIVE normal-click journey with ONE isolated, freshly generated test player (`jfix_*`), driven in a
 * real browser (Firefox by default) against the running local preview (default
 * http://127.0.0.1:5050: real backend, real Sheet, real Drive media). Nothing is fast-forwarded,
 * seeded or injected beyond the one stage the Gate leaves the player in (right after the doors,
 * before naming); every later step is an ordinary click. The real owner's rows are never read or
 * written. Records every /api response (status + latency) and each step's timing.
 *
 *   node scripts/verify-manual-journey-live.mjs [--browser=firefox|chromium] [--zoom=0.9]
 *        [--mobile] [--out=docs/reports/MANUAL_JOURNEY/<label>]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, firefox, expect as baseExpect } from '@playwright/test';

// Outcome waits are bounded but generous; the point of the run is to MEASURE action time, not to hide it.
const expect = baseExpect.configure({ timeout: 45000 });
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const browserName = arg('browser', 'firefox');
const zoom = Number(arg('zoom', '1'));
const mobile = process.argv.includes('--mobile');
const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5050';
const label = arg(
  'label',
  `${browserName}${mobile ? '-mobile' : ''}${zoom !== 1 ? `-z${zoom}` : ''}`,
);
const out = path.resolve(arg('out', `docs/reports/MANUAL_JOURNEY/${label}`));
fs.mkdirSync(out, { recursive: true });

const gateway = getProductionGatewayOrNull();
if (!gateway) throw new Error('BLOCKER: no Google credential available.');
const userId = `jfix_${Date.now()}`;
const iso = new Date().toISOString();
await gateway.appendRow('24_PLAYER_PROGRESS', {
  user_route_key: `${userId}|first_opening`,
  user_id: userId,
  story_route_id: 'first_opening',
  status: 'in_progress',
  current_beat_id: 'cove_arrival',
  last_checkpoint_id: 'cove_arrival',
  current_location: 'beach',
  updated_at: iso,
});
const sessionId = buildSessionId('gate', `jfix_${crypto.randomBytes(8).toString('hex')}`);
const now = new Date();
await createOrReconcileSession(gateway, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: `jfix-${userId}`,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 6 * 3600_000),
});
console.log(`Isolated test player: ${userId} (${label})`);
// The preview server caches whole tabs for up to 90 s; a row written from this process becomes visible to it after that.
await new Promise((r) => setTimeout(r, Number(process.env.CACHE_WAIT_MS ?? 95000)));

const requests = [];
const errors = [];
let currentStep = 'start';

const viewport = mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
const browser = await (browserName === 'chromium' ? chromium : firefox).launch();
const context = await browser.newContext({
  viewport:
    zoom !== 1 && !mobile
      ? { width: Math.round(1920 / zoom), height: Math.round(1080 / zoom) }
      : viewport,
  deviceScaleFactor: zoom !== 1 && !mobile ? 1 / zoom : 1,
  hasTouch: mobile,
  isMobile: mobile && browserName === 'chromium',
});
await context.addCookies([
  { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
]);
const page = await context.newPage();
const startedAt = new Map();
const runStart = Date.now();
page.on('request', (r) => r.url().includes('/api/') && startedAt.set(r, Date.now()));
page.on('response', (r) => {
  const req = r.request();
  const t0 = startedAt.get(req);
  if (t0 === undefined) return;
  requests.push({
    step: currentStep,
    t: t0 - runStart,
    method: req.method(),
    url: r.url().replace(origin, '').replace(/\?.*$/, ''),
    status: r.status(),
    ms: Date.now() - t0,
  });
});
page.on('requestfailed', (r) => {
  if (startedAt.has(r))
    requests.push({
      step: currentStep,
      method: r.method(),
      url: r.url().replace(origin, ''),
      status: 'FAILED',
      ms: Date.now() - startedAt.get(r),
    });
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on(
  'console',
  (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()),
);

const tid = (id) => page.locator(`[data-testid="${id}"]`);
const results = [];
const contentNotes = {};
let aborted = false;
async function step(name, fn) {
  if (aborted) return;
  currentStep = name;
  const t0 = Date.now();
  let ok = true;
  let detail = '';
  try {
    await fn();
  } catch (e) {
    ok = false;
    detail = String(e.message)
      .replace(/\s*\n\s*/g, ' ; ')
      .slice(0, 900);
    aborted = true;
    detail +=
      ' | testids: ' +
      (await page
        .evaluate(() =>
          [...document.querySelectorAll('[data-testid]')]
            .map((e) => e.dataset.testid + (e.disabled ? '(disabled)' : ''))
            .join(' '),
        )
        .catch(() => '?'));
    await page
      .screenshot({ path: path.join(out, `FAIL-${name.replace(/\W+/g, '_')}.png`) })
      .catch(() => {});
  }
  const ms = Date.now() - t0;
  results.push({ name, ok, ms, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} (${ms} ms)${detail ? ` — ${detail}` : ''}`);
}
// A person reads before tapping; a bot that clicks every 50 ms is not a normal-click journey.
const THINK_MS = Number(process.env.THINK_MS ?? 1200);
const click = async (id, timeout = 45000) => {
  await tid(id).first().waitFor({ state: 'visible', timeout });
  await page.waitForTimeout(THINK_MS);
  await tid(id).first().click({ timeout });
};
const place = async (id, view) => {
  await expect(tid('world-experience')).toHaveAttribute('data-place', id, { timeout: 60000 });
  if (view) await expect(tid('world-experience')).toHaveAttribute('data-view', view);
};
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
/** No full-page loading may replace the world once it has been shown. */
const noGlobalLoading = async () => {
  if (
    (await tid('world-loading').count()) > 0 ||
    (await tid('first-opening-resolving').count()) > 0
  )
    throw new Error('a full-page Loading view replaced the world');
};
const keyCount = async (key) =>
  Number(
    (
      await tid(`key-${key}`)
        .locator('span')
        .last()
        .textContent()
        .catch(() => '0')
    )?.trim() ?? '0',
  );
const keyIs = async (key, n) => expect.poll(() => keyCount(key), { timeout: 45000 }).toBe(n);
const serverJourney = () =>
  page.evaluate(async () => await (await fetch('/api/world/journey')).json());
const beatIs = (beat) =>
  expect
    .poll(async () => (await serverJourney()).currentBeat?.beatId, { timeout: 20000 })
    .toBe(beat);

/** Walk down the Beach path with ordinary taps until the wanted marker is on screen. */
const walkUntil = async (markerId) => {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    if (
      await tid(markerId)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    const forward = tid('walk-forward').first();
    // A hop is a walk animation; wait for it to finish, then look again before walking on.
    const enabled = await forward.isEnabled({ timeout: 1000 }).catch(() => false);
    if (!enabled) {
      await page.waitForTimeout(700);
      continue;
    }
    await forward.click();
    await page.waitForTimeout(900);
  }
  await tid(markerId).first().waitFor({ state: 'visible', timeout: 15000 });
};

await step('open app, resume session', async () => {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await tid('naming-name-input').waitFor({ state: 'visible', timeout: 30000 });
});
await step('Beach arrival → naming', async () => {
  await tid('naming-name-input').fill('Tester');
  await click('naming-gender-female');
  await click('naming-submit');
  await click('naming-continue', 20000);
  await place('beach');
  await shot('01-beach');
});
await step('Beach: collect the shell (real shell marker)', async () => {
  // The shell lies on the first Beach view; the key is awarded server-side.
  await tid('marker-shell')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  await walkUntil('marker-shell');
  if ((await tid('marker-shell').count()) > 0) {
    await click('marker-shell');
    await keyIs('key_shell', 1);
  } else throw new Error('no shell marker found on the Beach chain');
});
await step('Beach → Church door', async () => {
  await walkUntil('marker-church_door');
  await click('marker-church_door');
  await place('church', 'interior');
  await shot('02-church');
});
await step('Church: narration, verse, quiz, candle', async () => {
  if ((await tid('narration-continue').count()) > 0) await click('narration-continue');
  await click('church-verse');
  await click('church-verse-panel-close');
  await click('church-quiz');
  for (let i = 0; i < 6 && (await tid('quiz-done').count()) === 0; i++) {
    const options = page.locator('[data-testid^="quiz-option-"]');
    if ((await options.count()) === 0) break;
    await options.first().click();
    await page.waitForTimeout(500);
  }
  await click('church-quiz-panel-close');
  await click('candle-candle_1');
  await keyIs('key_candle', 1);
  await shot('03-church-candles');
  await click('church-leave');
  await place('beach');
});
await step('Beach → junction → Café exterior', async () => {
  await walkUntil('marker-road_onward');
  await click('marker-road_onward');
  await place('junction');
  await click('junction-cafe');
  await place('cafe', 'exterior');
});
await step('Café: enter, Gramophone, receive Walkman', async () => {
  await click('cafe-enter');
  await place('cafe', 'interior');
  await shot('04-cafe');
  await click('cafe-gramophone');
  await click('cafe-catalog-close');
  await click('walkman-receive');
  await expect(tid('walkman')).toBeVisible();
  await noGlobalLoading();
  await shot('05-cafe-walkman');
  await click('cafe-leave');
  await place('cafe', 'exterior');
  await keyIs('key_music', 1);
});
await step('Café → VARcade', async () => {
  await click('cafe-forward');
  await place('arcade', 'exterior');
  await click('arcade-enter');
  await place('arcade', 'interior');
  await shot('06-arcade');
});
await step('Arcade: play cabinet 1 to the end', async () => {
  await click('cabinet-1');
  await expect(tid('game-memory')).toBeVisible();
  const cards = await page.locator('[data-testid^="memory-card-"]').count();
  const card = (i) => page.locator(`[data-testid="memory-card-${i}"]`);
  const finished = async () => (await tid('arcade-outcome').count()) > 0;
  const symbols = new Map();
  const matched = new Set();
  const flip = async (i) => {
    await card(i).click({ timeout: 4000 });
    await expect(card(i)).not.toHaveAttribute('data-face', 'down', { timeout: 4000 });
    return (
      (await card(i).getAttribute('data-symbol')) ??
      (await card(i).textContent()) ??
      ''
    ).trim();
  };
  for (let guard = 0; guard < 80 && !(await finished()); guard++) {
    try {
      const open = [...Array(cards).keys()].filter((i) => !matched.has(i));
      const known = open.flatMap((i) =>
        open
          .filter((j) => j > i && symbols.get(i) !== undefined && symbols.get(i) === symbols.get(j))
          .map((j) => [i, j]),
      )[0];
      if (known) {
        await flip(known[0]);
        await flip(known[1]);
        known.forEach((i) => matched.add(i));
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
        await expect(card(a)).toHaveAttribute('data-face', 'down', { timeout: 4000 });
        await expect(card(b)).toHaveAttribute('data-face', 'down', { timeout: 4000 });
      }
    } catch (error) {
      if (await finished()) break;
      throw error;
    }
  }
  await expect(tid('arcade-outcome')).toContainText(/.+/, { timeout: 10000 });
  await shot('07-arcade-result');
  await noGlobalLoading();
  await keyIs('key_token', 1);
  await click('arcade-game-panel-close');
  await click('arcade-leave');
  await place('arcade', 'exterior');
});
await step('Arcade → Cottage exterior, enter, Continue', async () => {
  await click('arcade-forward');
  await place('cottage', 'exterior');
  await shot('08-cottage-exterior');
  await click('cottage-enter');
  await place('cottage', 'interior');
  await click('cottage-arrival-continue');
  await beatIs('beat_12_marcelino');
  await shot('09-cottage-interior');
});
await step('Cottage: leave, Marcelino, mailbox Open', async () => {
  await click('cottage-leave');
  await place('cottage', 'exterior');
  await click('marcelino-deliver');
  await click('marcelino-hand-over');
  // Ahmed's first message is written in the Sheet. When it is not written yet nothing is invented
  // and the step still completes (Marcelino runs off); when it is, it opens like any letter.
  const outcome = await Promise.race([
    tid('mailbox-panel')
      .waitFor({ state: 'visible', timeout: 90000 })
      .then(() => 'message'),
    tid('marcelino-runs')
      .waitFor({ state: 'visible', timeout: 90000 })
      .then(() => 'pending'),
  ]);
  contentNotes.firstMessage = outcome;
  if (outcome === 'message') {
    await click('mail-open-msg_first');
    await expect(tid('message-text')).toBeVisible();
    await shot('10-mailbox');
    await click('mailbox-panel-close');
  } else {
    await shot('10-marcelino-message-pending');
  }
  await noGlobalLoading();
  await keyIs('key_letter', 1);
});
await step('Cottage → Sunberry Fields: plant + water', async () => {
  await click('cottage-forward');
  await place('farm');
  await click('plot-plot_1');
  await click('plant-sunflower');
  await click('plot-plot_1');
  await click('water-plot');
  await keyIs('key_sunflower', 1);
  await shot('11-farm');
});
await step('Farm → Everkeep gate: sockets, solve, verify', async () => {
  await click('farm-forward');
  await place('museum', 'exterior');
  await click('museum-gate');
  for (const key of ['shell', 'candle', 'music', 'token', 'letter', 'sunflower'])
    await click(`socket-key_${key}`);
  await shot('12-museum-gate');
  await click('museum-solve');
  await click('museum-verify');
  await place('museum', 'interior');
  await keyIs('key_everkeep', 1);
});
await step('Everkeep hall → receive the Map', async () => {
  await click('museum-artifact');
  await click('map-receive');
  await place('map');
  await shot('13-map');
  await expect.poll(async () => (await serverJourney()).mapUnlocked, { timeout: 15000 }).toBe(true);
});
await step('Reload after completion resumes at the Cottage', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await place('cottage', 'interior');
  await expect(tid('open-map')).toBeVisible();
  await keyIs('key_everkeep', 1);
});

const slow = requests.filter(
  (r) => typeof r.ms === 'number' && r.ms > 3000 && !r.url.startsWith('/api/media'),
);
fs.writeFileSync(
  path.join(out, 'results.json'),
  JSON.stringify({ userId, label, results, contentNotes, requests, errors }, null, 2),
);
console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} steps passed; ${requests.length} API calls; ${slow.length} slower than 3 s; page errors: ${errors.length}`,
);
for (const r of slow)
  console.log(`  slow: ${r.method} ${r.url} ${r.status} ${r.ms} ms (${r.step})`);
await browser.close();
process.exit(results.every((r) => r.ok) && !aborted ? 0 : 1);
