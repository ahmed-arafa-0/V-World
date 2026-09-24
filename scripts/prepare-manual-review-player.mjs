#!/usr/bin/env node
/**
 * Prepares ONE isolated test player (user id `manual_review_player`) on the live Sheet for manual
 * review and mints a fresh 8-hour owner session for it (the same mechanism the isolated live
 * verification scripts use). It never reads or writes the real owner's rows and does not touch the
 * Gate, login or security flow. Rows are only created when absent, so re-running just mints a new
 * session. `--fresh` prepares the player at the end of naming (journey not started) instead of
 * journey-complete with the Map open.
 *
 * `--start=cove` instead creates a NEW player (`manual_review_<timestamp>`) standing just after the
 * Gate's doors with no keys and no character, so naming, the shell, the Church ... the Map are all
 * played by hand. `--user=<manual_review_id>` mints a fresh 8 h session for an existing such player
 * (no new rows). `--open` then opens a headed Firefox already signed in as that player at
 * http://127.0.0.1:5050 (start the preview first: npm run build && npm run preview:local).
 * Manually invoked: node scripts/prepare-manual-review-player.mjs [--start=cove | --user=<id>] [--open]
 */
import crypto from 'node:crypto';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const reuseUser = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];
const startCove = process.argv.includes('--start=cove') || Boolean(reuseUser);
if (reuseUser && !/^manual_review_[0-9]+$/.test(reuseUser)) {
  console.error('BLOCKER: --user must be a manual_review_<timestamp> player made by --start=cove.');
  process.exit(1);
}
const USER_ID = reuseUser ?? (startCove ? `manual_review_${Date.now()}` : 'manual_review_player');
const fresh = process.argv.includes('--fresh');
const gateway = getProductionGatewayOrNull();
if (!gateway) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const iso = new Date().toISOString();
const add = (tab, key, row) => gateway.appendIfAbsent(tab, key, () => row);
if (startCove) {
  // The truest start a manual tester can have: just after the Gate's doors, naming still ahead, no
  // keys and no character. Every later step (naming, shell, Church ... Map) is played by hand.
  await add('24_PLAYER_PROGRESS', `${USER_ID}|first_opening`, {
    user_route_key: `${USER_ID}|first_opening`,
    user_id: USER_ID,
    story_route_id: 'first_opening',
    status: 'in_progress',
    current_beat_id: 'cove_arrival',
    last_checkpoint_id: 'cove_arrival',
    current_location: 'beach',
    updated_at: iso,
  });
}

if (!startCove)
  await add('24_PLAYER_PROGRESS', `${USER_ID}|first_opening`, {
    user_route_key: `${USER_ID}|first_opening`,
    user_id: USER_ID,
    story_route_id: 'first_opening',
    status: 'in_progress',
    current_beat_id: 'naming_complete',
    last_checkpoint_id: 'naming_complete',
    updated_at: iso,
  });
if (!startCove)
  await add('25_PLAYER_KEYS', `${USER_ID}|key_shell`, {
    user_key_type: `${USER_ID}|key_shell`,
    user_id: USER_ID,
    key_type_id: 'key_shell',
    quantity_found: '1',
    quantity_spent: '0',
    quantity_available: '1',
    last_award_date: iso.slice(0, 10),
    last_source_id: 'first_opening_beach_shell_v1',
  });
if (!startCove)
  await add('37_CHARACTER_STATE', `${USER_ID}|var`, {
    user_character_key: `${USER_ID}|var`,
    user_id: USER_ID,
    character_id: 'var',
    personal_name: 'Reviewer',
    selected_gender: 'female',
    updated_at: iso,
  });
if (!fresh && !startCove) {
  await add('24_PLAYER_PROGRESS', `${USER_ID}|first_journey`, {
    user_route_key: `${USER_ID}|first_journey`,
    user_id: USER_ID,
    story_route_id: 'first_journey',
    status: 'completed',
    first_journey_completed: 'TRUE',
    map_unlocked: 'TRUE',
    completed_at: iso,
    updated_at: iso,
  });
}

const sessionId = buildSessionId('gate', `manual_review_${crypto.randomBytes(12).toString('hex')}`);
const now = new Date();
await createOrReconcileSession(gateway, {
  sessionId,
  userId: USER_ID,
  ip: '127.0.0.1',
  deviceId: 'manual-review',
  createdAt: now,
  expiresAt: new Date(now.getTime() + 8 * 3600_000),
});
console.log(
  `Test player: ${USER_ID} (${startCove ? 'new player just after the doors: naming and the whole journey ahead' : fresh ? 'fresh, journey not started' : 'journey complete, Map open'})`,
);
console.log(`Session valid until ${new Date(now.getTime() + 8 * 3600_000).toLocaleString()}`);
console.log('Session kept inside this process; use --open to launch the isolated review.');

if (process.argv.includes('--open')) {
  const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5050';
  // The preview server caches whole tabs (90 s), so it may not see a player created in this process
  // yet. Ask it, as this player and through its own session, until it does (bounded), instead of
  // sleeping a fixed time. A reused player (--user) is normally visible at once.
  const readiness = await waitUntilPreviewSeesPlayer(origin, sessionId);
  console.log(readiness.message);
  if (!readiness.ok) process.exit(1);
  const { firefox } = await import('@playwright/test');
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext({ viewport: null });
  await context.addCookies([
    { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
  ]);
  const page = await context.newPage();
  await page.goto(origin);
  const shown = await page
    .locator('[data-testid="naming-name-input"], [data-testid="world-experience"]')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => 'the game (signed in as the test player)')
    .catch(() => null);
  console.log(
    shown
      ? `Firefox is open and showing ${shown}. Close its window when you are done.`
      : 'Firefox opened but the game did not appear within 45 s; check the preview server.',
  );
  await new Promise((resolve) => browser.on('disconnected', resolve));
}

async function waitUntilPreviewSeesPlayer(origin, sessionId, maxMs = 120_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < maxMs) {
    try {
      const response = await fetch(`${origin}/api/player/state`, {
        headers: { Cookie: `vw_owner_session=${sessionId}` },
      });
      if (response.ok) {
        const state = await response.json();
        if (state.progress?.some((row) => row.routeId === 'first_opening')) {
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          return { ok: true, message: `The preview sees the player (after ${secs} s).` };
        }
        lastError =
          'the preview has not loaded the new player row yet (its tab cache is up to 90 s old)';
      } else lastError = `the preview answered ${response.status}`;
    } catch {
      return {
        ok: false,
        message: `Cannot reach ${origin}: start it first (npm run preview:local).`,
      };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, message: `Gave up after ${maxMs / 1000} s: ${lastError}.` };
}
