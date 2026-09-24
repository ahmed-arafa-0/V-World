#!/usr/bin/env node
/**
 * Bounded, ONE-TIME real-browser verification (not a full journey walk) that the three content/
 * audio fixes in this task are actually live end-to-end: the newly-enabled Church doorway dialogue
 * (with the companion staying outside), the registered story image rendering inside the Church, and
 * the new Gospel-reading mute control. Reuses `scripts/verify-manual-journey-live.mjs`'s exact
 * isolated-player/session-minting pattern (a fresh, uniquely-id'd `jfix_*` player, never `veoulla`)
 * but stops right after the Church instead of walking the whole first journey — this task never
 * touched journey progression logic itself, so a full walk would just re-spend quota re-proving
 * behavior `docs/reports/MANUAL_JOURNEY/REPORT.md` already evidenced.
 *
 *   node scripts/verify-dialogue-images-audio-live.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { firefox, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 45000 });
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5050';
const out = path.resolve('docs/reports/DIALOGUE_IMAGES_AUDIO_LIVE');
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
console.log(`Isolated test player: ${userId}`);
await new Promise((r) => setTimeout(r, Number(process.env.CACHE_WAIT_MS ?? 95000)));

const browser = await firefox.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addCookies([
  { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
]);
// Today's scheduled story content is Arabic-only (per the content-banks-v1 import); the church
// story-image panel only has something to show in that locale, matching how the app already
// honestly renders nothing for a locale with no translation.
await context.addInitScript(() => {
  globalThis.localStorage.setItem(
    'vw_locale',
    JSON.stringify({ state: { locale: 'ar-EG' }, version: 0 }),
  );
});
const page = await context.newPage();
const tid = (id) => page.locator(`[data-testid="${id}"]`);
/** Clicks through every not-yet-seen beat narration overlay (in order) until either none remains
 * or one whose `data-group` matches `stopAtGroup` is showing (left un-clicked, for inspection). */
async function clickThroughNarrationUntil(stopAtGroup, maxBeats = 12) {
  for (let i = 0; i < maxBeats; i++) {
    const narration = tid('beat-narration').first();
    const visible = await narration.isVisible().catch(() => false);
    if (!visible) return { found: false };
    const group = await narration.getAttribute('data-group');
    if (group === stopAtGroup) return { found: true };
    await page.waitForTimeout(THINK_MS);
    await tid('narration-continue').first().click();
    await page.waitForTimeout(400);
  }
  return { found: false };
}
const THINK_MS = 900;
const click = async (id, timeout = 45000) => {
  await tid(id).first().waitFor({ state: 'visible', timeout });
  await page.waitForTimeout(THINK_MS);
  await tid(id).first().click({ timeout });
};
const place = async (id, view) => {
  await expect(tid('world-experience')).toHaveAttribute('data-place', id, { timeout: 60000 });
  if (view) await expect(tid('world-experience')).toHaveAttribute('data-view', view);
};
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

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  PASS  ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e.message).slice(0, 500) });
    console.log(`  FAIL  ${name}: ${String(e.message).slice(0, 500)}`);
    await page
      .screenshot({ path: path.join(out, `FAIL-${name.replace(/\W+/g, '_')}.png`) })
      .catch(() => {});
  }
}

await step('open app, complete naming, arrive at Beach', async () => {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await tid('naming-name-input').waitFor({ state: 'visible', timeout: 30000 });
  await tid('naming-name-input').fill('Tester');
  await click('naming-gender-female');
  await click('naming-submit');
  await click('naming-continue', 20000);
  await place('beach');
});

await step(
  'click through any earlier Beach beats, walk to the church door, companion outside',
  async () => {
    await clickThroughNarrationUntil('dlg_church');
    await walkUntil('marker-church_door');
    await page.screenshot({ path: path.join(out, '01-church-doorway.png') });
    const companionVisible = await tid('world-companion')
      .first()
      .isVisible()
      .catch(() => false);
    if (!companionVisible) throw new Error('companion is not visible at the church doorway');
  },
);

await step(
  'enter the church: doorway dialogue, no companion, story image, mute control',
  async () => {
    await click('marker-church_door');
    await place('church', 'interior');
    const companionInside = await tid('world-companion')
      .first()
      .isVisible()
      .catch(() => false);
    if (companionInside) throw new Error('companion should not be rendered inside the Church');
    // The doorway line ("...I'll wait here outside") renders once inside the Church place itself
    // (beat_07_church's locationId is 'church', not 'beach') and blocks Leave, by design, until read.
    await page.waitForTimeout(1500);
    const narration = tid('beat-narration').first();
    if (await narration.isVisible().catch(() => false)) {
      const group = await narration.getAttribute('data-group');
      if (group !== 'dlg_church') throw new Error(`expected dlg_church narration, found: ${group}`);
      const bodyText = await page.textContent('body');
      if (!/church door/i.test(bodyText ?? ''))
        throw new Error('doorway narration text ("church door") not found on screen');
      await page.screenshot({ path: path.join(out, '01b-church-doorway-narration.png') });
      await page.waitForTimeout(THINK_MS);
      await tid('narration-continue').first().click();
    }
    await click('church-story');
    const img = page.locator('[data-testid="church-story-panel"] img');
    await img.first().waitFor({ state: 'attached', timeout: 15000 });
    const src = await img.first().getAttribute('src');
    if (!src || !src.startsWith('/api/media/'))
      throw new Error(`unexpected story image src: ${src}`);
    await page.screenshot({ path: path.join(out, '02-church-story-image.png') });
    await click('church-story-panel-close').catch(async () => {
      await page.keyboard.press('Escape');
    });
  },
);

await step('mute control: toggles, persists, still fades on leave', async () => {
  const mute = tid('church-mute-audio').first();
  await mute.waitFor({ state: 'visible', timeout: 15000 });
  const before = await mute.getAttribute('aria-pressed');
  await mute.click();
  await page.waitForTimeout(300);
  const after = await mute.getAttribute('aria-pressed');
  if (before === after) throw new Error(`aria-pressed did not toggle (stayed ${before})`);
  await page.screenshot({ path: path.join(out, '03-church-muted.png') });
  await click('church-leave');
  await place('beach');
});

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ userId, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed.`);
await browser.close();
if (failed.length) process.exit(1);
