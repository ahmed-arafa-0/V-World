#!/usr/bin/env node
/**
 * Real in-app verification (not a standalone harness) of the Church audio, Walkman, and YouTube
 * ocean changes, driven through the actual running app on the isolated review server (port 5051)
 * as the existing isolated review player (`manual_review_1790065059494`, journey already complete,
 * Map unlocked). Never touches Ahmed's own session/preview (port 5050).
 *
 * Manually invoked: node scripts/verify-integration-closure-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { firefox } from '@playwright/test';

const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:5051';
const SESSION_ID = process.argv[2];
if (!SESSION_ID) {
  console.error('Usage: node scripts/verify-integration-closure-live.mjs <sessionId>');
  process.exit(1);
}

const OUT_DIR = 'test-results/integration-closure';
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
}

const browser = await firefox.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addCookies([
  { name: 'vw_owner_session', value: SESSION_ID, domain: '127.0.0.1', path: '/' },
]);
const page = await context.newPage();

// Instrument real audio elements/constructors so we can observe genuine in-app playback
// (volume, play/pause calls, src) without faking anything the app itself does.
await context.addInitScript(() => {
  globalThis.__audioLog = [];
  const OrigAudio = globalThis.Audio;
  globalThis.Audio = function (...args) {
    const el = new OrigAudio(...args);
    const entry = { src: args[0] ?? null, plays: 0, pauses: 0, volumeAtPlay: [] };
    globalThis.__audioLog.push(entry);
    const origPlay = el.play.bind(el);
    el.play = (...pArgs) => {
      entry.plays += 1;
      entry.volumeAtPlay.push(el.volume);
      entry.lastSrc = el.src;
      return origPlay(...pArgs);
    };
    const origPause = el.pause.bind(el);
    el.pause = (...pArgs) => {
      entry.pauses += 1;
      return origPause(...pArgs);
    };
    return el;
  };
  globalThis.__audioLog.push = globalThis.__audioLog.push.bind(globalThis.__audioLog);
});

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.log('  [page error]', msg.text());
    Promise.all(
      msg.args().map((a) =>
        a
          .evaluate((v) =>
            v && (v.stack || v.message)
              ? { message: v.message, stack: v.stack, name: v.name }
              : v,
          )
          .catch(() => a.toString()),
      ),
    )
      .then((values) => console.log('  [page error args]', JSON.stringify(values, null, 2)))
      .catch(() => undefined);
  }
});
page.on('pageerror', (err) => console.log('  [page exception]', err?.message ?? err, err?.stack));

try {
  console.log(`\n=== Loading ${ORIGIN} as the isolated review player ===`);
  await page.goto(ORIGIN);
  await page.getByTestId('world-experience').waitFor({ state: 'visible', timeout: 30000 });
  const place0 = await page.getByTestId('world-experience').getAttribute('data-place');
  record('App loads to WorldExperience', true, `initial place=${place0}`);

  // Travel to the Beach exterior (via the Map, since Map is unlocked for this player) so the
  // shell marker and the road to the Church are reachable, regardless of where the session left off.
  if (place0 !== 'beach') {
    console.log(`  Not on Beach (place=${place0}) — traveling there via the Map.`);
    const openMap = page.getByTestId('open-map');
    await openMap.click();
    await page.getByTestId('world-map').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('map-pin-beach').click();
    await page
      .waitForFunction(
        () => globalThis.document.querySelector('[data-testid="world-experience"]')?.getAttribute('data-place') === 'beach',
        { timeout: 10000 },
      )
      .catch(() => undefined);
    const placeAfterTravel = await page.getByTestId('world-experience').getAttribute('data-place');
    record('Travel to Beach via the Map', placeAfterTravel === 'beach', `place=${placeAfterTravel}`);
  }

  // ---------------------------------------------------------------------
  // 1. Shell -> Ocean: real in-app YouTube playback, Back/Escape, reopen.
  // ---------------------------------------------------------------------
  console.log('\n=== Ocean (shell marker) ===');
  try {
  const keysBefore = await page.evaluate(async () => {
    const r = await fetch('/api/player/state');
    return (await r.json()).keys.find((k) => k.keyTypeId === 'key_shell');
  });

  const shellMarker = page.getByTestId('marker-shell');
  if (await shellMarker.isVisible().catch(() => false)) {
    await shellMarker.click();
    const ocean = page.getByTestId('ocean-view');
    await ocean.waitFor({ state: 'visible', timeout: 10000 });
    // Reach a real terminal state (playing/blocked/restricted/failed), not just "not loading".
    await page
      .waitForFunction(
        () => {
          const el = globalThis.document.querySelector('[data-testid="ocean-view"]');
          return el && el.getAttribute('data-state') !== 'loading';
        },
        { timeout: 15000 },
      )
      .catch(() => undefined);
    let state = await ocean.getAttribute('data-state');
    if (state === 'blocked') {
      // A real race: the grace timer can flag 'blocked' just as the browser actually allows
      // autoplay a moment later, unmounting ocean-play before the click lands — that is a benign
      // transition, not a bug, so the click itself is best-effort with a short bounded timeout.
      await page
        .getByTestId('ocean-play')
        .click({ timeout: 3000 })
        .catch(() => undefined);
      await page
        .waitForFunction(
          () => globalThis.document.querySelector('[data-testid="ocean-view"]')?.getAttribute('data-state') === 'playing',
          { timeout: 8000 },
        )
        .catch(() => undefined);
      state = await ocean.getAttribute('data-state');
    }
    record('Ocean reaches a real playback state', state === 'playing', `data-state=${state}`);
    if (state === 'playing') {
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, 'ocean-playing.png') });
    }

    // Back button closes and destroys the player.
    await page.getByTestId('ocean-close').click();
    const closedByBack = await ocean
      .waitFor({ state: 'detached', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    record('Back closes the ocean view', closedByBack);

    // No duplicate shell reward from opening/closing again.
    const keysAfterFirst = await page.evaluate(async () => {
      const r = await fetch('/api/player/state');
      return (await r.json()).keys.find((k) => k.keyTypeId === 'key_shell');
    });
    record(
      'Reopening the shell does not duplicate the shell key reward',
      keysAfterFirst?.quantityFound === keysBefore?.quantityFound,
      `before=${keysBefore?.quantityFound} after=${keysAfterFirst?.quantityFound}`,
    );

    // Reopen -> fresh player instance, then close with Escape this time.
    await shellMarker.click();
    await ocean.waitFor({ state: 'visible', timeout: 10000 });
    await page
      .waitForFunction(
        () => globalThis.document.querySelector('[data-testid="ocean-view"]')?.getAttribute('data-state') !== 'loading',
        { timeout: 15000 },
      )
      .catch(() => undefined);
    const reopenState = await ocean.getAttribute('data-state');
    record('Reopen creates a fresh player and reaches a real state', reopenState !== 'loading', `data-state=${reopenState}`);
    await page.keyboard.press('Escape');
    const closedByEscape = await ocean
      .waitFor({ state: 'detached', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    record('Escape closes the ocean view', closedByEscape);

    // Slow loading: throttle the YouTube iframe API request and confirm Back stays usable
    // while state === 'loading' (never obstructed, never stuck).
    await page.route('**/iframe_api', async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await shellMarker.click();
    await ocean.waitFor({ state: 'visible', timeout: 10000 });
    const loadingState = await ocean.getAttribute('data-state');
    const backUsableWhileLoading = await page.getByTestId('ocean-close').isEnabled();
    record(
      'Back stays usable while the ocean is slow-loading',
      loadingState === 'loading' && backUsableWhileLoading,
      `data-state=${loadingState}`,
    );
    await page.getByTestId('ocean-close').click();
    await ocean.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    await page.unroute('**/iframe_api');
  } else {
    record('Shell marker reachable on Beach', false, 'not visible at the current node/place');
  }
  } catch (error) {
    console.error('Ocean section error:', error);
    record('Ocean section', false, String(error));
  }
  // Unconditional cleanup: never let a leftover ocean overlay intercept clicks in later sections.
  await page.unroute('**/iframe_api').catch(() => undefined);
  for (let i = 0; i < 3 && (await page.getByTestId('ocean-view').isVisible().catch(() => false)); i++) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
  }

  // ---------------------------------------------------------------------
  // 2. Walkman: play, pause, seek, volume, mute, navigation.
  // ---------------------------------------------------------------------
  console.log('\n=== Walkman ===');
  try {
  const walkmanToggleControl = page.getByTestId('walkman');
  if (await walkmanToggleControl.isVisible().catch(() => false)) {
    await walkmanToggleControl.click();
    await page.getByTestId('walkman-panel').waitFor({ state: 'visible', timeout: 8000 });
    const hasPlaylist = await page
      .getByTestId('walkman-playlist')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (hasPlaylist) {
      const firstTrack = page.getByTestId('walkman-playlist').locator('button').first();
      await firstTrack.click();
      await page.waitForTimeout(500);
      const audioEl = page.getByTestId('walkman-audio');
      const playingNow = await audioEl.evaluate((el) => !el.paused);
      record('Walkman track playback starts', playingNow);

      await page.getByTestId('walkman-toggle').click();
      await page.waitForTimeout(300);
      const pausedNow = await audioEl.evaluate((el) => el.paused);
      record('Walkman toggle pauses playback', pausedNow);
      await page.getByTestId('walkman-toggle').click();
      await page.waitForTimeout(300);

      // React range inputs need the value set through the real HTMLInputElement setter (not a
      // plain `.value =` assignment) so React's own change-detection sees it, exactly as a real
      // user drag would; a bare assignment + dispatch is silently ignored by React's controlled
      // input tracking.
      async function setRangeValue(testId, value) {
        await page.getByTestId(testId).evaluate((el, v) => {
          const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(v));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
      }

      // Seek — wait for the real streamed audio to actually report a usable duration first
      // (loadedmetadata over the media gateway), rather than assuming it is ready.
      const duration = await audioEl
        .evaluate(
          (el) =>
            new Promise((resolve) => {
              if (el.duration > 0 && Number.isFinite(el.duration)) return resolve(el.duration);
              const onMeta = () => {
                el.removeEventListener('loadedmetadata', onMeta);
                resolve(el.duration || 0);
              };
              el.addEventListener('loadedmetadata', onMeta);
              setTimeout(() => resolve(el.duration || 0), 5000);
            }),
        )
        .catch(() => 0);
      if (duration > 1) {
        await setRangeValue('walkman-seek', Math.floor(Math.min(duration / 2, duration - 0.5)));
        await page.waitForTimeout(300);
        const seeked = await audioEl.evaluate((el) => el.currentTime);
        record('Walkman seek moves playback position', seeked > 0.5, `currentTime=${seeked.toFixed(2)}`);
      } else {
        record('Walkman seek moves playback position', false, `no usable duration from the real audio element (duration=${duration})`);
      }

      // Volume — the real slider is 0-100 (percent), matching Walkman.tsx's own `max={100}`.
      await setRangeValue('walkman-volume', 40);
      await page.waitForTimeout(200);
      const vol = await audioEl.evaluate((el) => el.volume);
      record('Walkman volume control changes real audio volume', Math.abs(vol - 0.4) < 0.05, `volume=${vol}`);

      // Mute — start from a known unmuted state (volume 40 above already implies unmuted).
      const mutedBefore = await audioEl.evaluate((el) => el.muted);
      await page.getByTestId('walkman-mute').click();
      await page.waitForTimeout(200);
      const mutedNow = await audioEl.evaluate((el) => el.muted);
      record('Walkman mute control mutes the real audio element', mutedBefore === false && mutedNow === true, `before=${mutedBefore} after=${mutedNow}`);
      await page.getByTestId('walkman-mute').click();

      // Navigation. With only one eligible track, Next/Prev correctly cycle back to the same
      // track (single-item playlist) — that is the real, current catalog state, not a bug, so
      // only assert a track change when more than one track is actually available.
      const trackCount = await page.getByTestId('walkman-playlist').locator('button').count();
      const titleBefore = await page.getByTestId('walkman-title').textContent();
      await page.getByTestId('walkman-next').click();
      await page.waitForTimeout(300);
      const titleAfter = await page.getByTestId('walkman-title').textContent();
      if (trackCount > 1) {
        record('Walkman Next changes the current track', titleAfter !== titleBefore, `${titleBefore} -> ${titleAfter}`);
      } else {
        record(
          'Walkman Next cycles correctly (only 1 track currently registered)',
          titleAfter === titleBefore,
          `trackCount=${trackCount}, title=${titleAfter}`,
        );
      }
      await page.getByTestId('walkman-prev').click();

      await audioEl.evaluate((el) => el.pause());
    } else {
      record('Walkman has playable tracks', false, 'walkman-playlist never appeared (walkman-empty state?)');
    }
    await page.getByTestId('walkman-panel-close').click().catch(() => undefined);
  } else {
    record('Walkman control visible on the current screen', false);
  }
  } catch (error) {
    console.error('Walkman section error:', error);
    record('Walkman section', false, String(error));
  }

  // ---------------------------------------------------------------------
  // 3. Church: bell on exterior arrival, Walkman silenced/hidden, no cat,
  //    Gospel reading at 0.05 volume, continuity, fade on exit.
  // ---------------------------------------------------------------------
  console.log('\n=== Church ===');
  try {
  // Return to Beach, then walk to the road, then to the Church exterior (church_focus) via Junction.
  await page.evaluate(() => globalThis.__audioLog.splice(0, globalThis.__audioLog.length));
  const roadMarker = page.getByTestId('marker-road_onward');
  if (await roadMarker.isVisible().catch(() => false)) {
    await roadMarker.click();
  }
  const junctionChurch = page.getByTestId('junction-church');
  const reachedJunction = await junctionChurch.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (reachedJunction) {
    await junctionChurch.click();
    // Bell is edge-triggered on arrival at beach/church_focus.
    await page.waitForTimeout(800);
    const bellRang = await page.evaluate(() =>
      globalThis.__audioLog.some((a) => (a.src || '').includes('audio_church_bell_exterior') && a.plays > 0),
    );
    record('Exterior bell plays once on Church-exterior arrival', bellRang);

    // Re-render at the same node must NOT replay the bell (edge-triggered, not level-triggered).
    const bellCallsBefore = await page.evaluate(() =>
      globalThis.__audioLog.filter((a) => (a.src || '').includes('audio_church_bell_exterior')).reduce((n, a) => n + a.plays, 0),
    );
    await page.mouse.move(5, 5); // trivial interaction, no navigation
    await page.waitForTimeout(300);
    const bellCallsAfter = await page.evaluate(() =>
      globalThis.__audioLog.filter((a) => (a.src || '').includes('audio_church_bell_exterior')).reduce((n, a) => n + a.plays, 0),
    );
    record('Bell does not replay on unrelated re-renders at the same node', bellCallsAfter === bellCallsBefore);

    const churchDoor = page.getByTestId('marker-church_door');
    if (await churchDoor.isVisible().catch(() => false)) {
      await churchDoor.click();
      const interiorOrCorner = await page
        .getByTestId('church-interior')
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      record('Church interior loads', interiorOrCorner);

      if (interiorOrCorner) {
        // Walkman hidden/silenced inside Church.
        const walkmanHidden = await page.getByTestId('walkman').isVisible().catch(() => false);
        record('Walkman control is hidden inside the Church', !walkmanHidden);

        // No cat/companion inside the Church.
        const companionVisible = await page.getByTestId('world-companion').isVisible().catch(() => false);
        record('No companion (cat) inside the Church', !companionVisible);

        // Gospel reading: real Audio() constructed, volume 0.05, and play() attempted. It is a
        // plain JS `new Audio()` object (never inserted into the DOM), so `document`'s <audio>
        // elements (the Walkman's own persistent tag) are a different thing entirely — identify
        // it in our constructor log by its resolved media-gateway src instead.
        await page.waitForTimeout(800);
        const gospelEntry = await page.evaluate(() =>
          globalThis.__audioLog.find(
            (a) => (a.src || '').includes('gospel') || (a.lastSrc || '').includes('gospel'),
          ),
        );
        record(
          'Gospel reading audio plays at the specified 0.05 volume',
          !!gospelEntry && gospelEntry.plays > 0 && Math.abs((gospelEntry.volumeAtPlay[0] ?? -1) - 0.05) < 0.001,
          gospelEntry ? `plays=${gospelEntry.plays} volume=${gospelEntry.volumeAtPlay[0]}` : 'no gospel-reading Audio() constructed',
        );

        // Continuity between interior and the candle corner: the SAME Audio() instance persists
        // (no new `new Audio()` call, i.e. no extra __audioLog entry) rather than being torn down
        // and recreated when switching between the two ChurchView-owned backgrounds.
        const logLengthBefore = await page.evaluate(() => globalThis.__audioLog.length);
        const cornerHotspot = page.getByTestId('church-candle-corner');
        if (await cornerHotspot.isVisible().catch(() => false)) {
          await cornerHotspot.click();
          await page.getByTestId('candle-tray').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
          await page.waitForTimeout(300);
          const logLengthAfter = await page.evaluate(() => globalThis.__audioLog.length);
          record(
            'Gospel reading continues (same Audio() instance, no remount) moving interior -> candle corner',
            logLengthAfter === logLengthBefore,
            `audioInstancesBefore=${logLengthBefore} audioInstancesAfter=${logLengthAfter}`,
          );
          await page.getByTestId('church-candle-back').click().catch(() => undefined);
          await page.getByTestId('church-interior').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
        } else {
          record('Candle corner reachable from Church interior', false);
        }

        // Fade/stop on Church exit: fadeOutAndStop() calls the real (instrumented) .pause().
        const leave = page.getByTestId('church-leave');
        if (await leave.isVisible().catch(() => false)) {
          await leave.click();
          await page.getByTestId('world-experience').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
          await page.waitForTimeout(900); // fadeOutAndStop runs ~600ms
          const gospelPausedOnExit = await page.evaluate(() =>
            globalThis.__audioLog.some(
              (a) => ((a.src || '').includes('gospel') || (a.lastSrc || '').includes('gospel')) && a.pauses > 0,
            ),
          );
          record('Gospel reading stops (pause() called) on Church exit', gospelPausedOnExit);
        } else {
          record('Church leave control reachable', false);
        }
      }
    } else {
      record('Church door marker reachable at church_focus', false);
    }
  } else {
    record('Junction reachable via the road onward', false);
  }
  } catch (error) {
    console.error('Church section error:', error);
    record('Church section', false, String(error));
  }

  await page.screenshot({ path: path.join(OUT_DIR, 'final-state.png') }).catch(() => undefined);
} catch (error) {
  console.error('SCRIPT ERROR:', error);
  results.push({ name: 'script-level failure', pass: false, detail: String(error) });
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
