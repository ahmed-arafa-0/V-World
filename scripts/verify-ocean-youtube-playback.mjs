#!/usr/bin/env node
/**
 * Real-browser verification of the two YouTube ocean clips, using the exact same YouTube IFrame
 * Player API config `OceanView.tsx` uses (autoplay, mute, loop+playlist trick, controls). Confirms,
 * for BOTH video ids, on both a desktop and a mobile viewport:
 *  - the player actually reaches the PLAYING state (real embedded playback, not just "no error"),
 *  - no embedding-restriction error (101/150) is reported,
 *  - a screenshot is saved so day/sunset content can be visually confirmed rather than assumed,
 *  - destroying the player (close) and creating a fresh one (reopen) both work.
 * Manually invoked: node scripts/verify-ocean-youtube-playback.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const VIDEOS = [
  { id: '8HDjaAV_12s', label: 'daytime (per oEmbed title: Turquoise Ocean off Seychelles Island)' },
  { id: 'C_Edf-nAc6g', label: 'sunset (per oEmbed title: Deep Orange Sunset on a Remote Beach)' },
];

const OUT_DIR = 'test-results/ocean-youtube';
fs.mkdirSync(OUT_DIR, { recursive: true });

const html = `<!doctype html><html><body style="margin:0;background:#000">
<div id="player" style="position:absolute;inset:0;width:100%;height:100%"></div>
<script>
  window.__state = 'unstarted';
  window.__error = null;
  window.__ready = false;
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = function () { window.__apiReady = true; };
  window.__makePlayer = function (videoId) {
    window.__state = 'unstarted';
    window.__error = null;
    window.__ready = false;
    window.__player = new YT.Player('player', {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, mute: 1, controls: 1, playsinline: 1, loop: 1, playlist: videoId, rel: 0 },
      events: {
        onReady: function (e) {
          window.__ready = true;
          window.__duration = e.target.getDuration();
          var at = Math.max(0, Math.random() * Math.max(0, window.__duration - 2));
          e.target.seekTo(at, true);
          window.__seekedTo = at;
          e.target.playVideo();
        },
        onStateChange: function (e) { window.__state = e.data; },
        onError: function (e) { window.__error = e.data; },
      },
    });
  };
  window.__destroyPlayer = function () {
    if (window.__player) { window.__player.destroy(); window.__player = null; }
  };
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const viewports = [
  { name: 'desktop', context: {} },
  { name: 'mobile', context: { ...devices['iPhone 13'] } },
];

let anyRestricted = false;
try {
  for (const viewport of viewports) {
    console.log(`\n=== Viewport: ${viewport.name} ===`);
    const context = await browser.newContext(viewport.context);
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => globalThis.__apiReady === true, null, { timeout: 15000 });

    for (const video of VIDEOS) {
      console.log(`\n-- ${video.id} (${video.label}) --`);
      // Open (create player) and confirm real playback.
      await page.evaluate((id) => globalThis.__makePlayer(id), video.id);
      try {
        await page.waitForFunction(() => globalThis.__ready === true, null, { timeout: 15000 });
        await page.waitForFunction(
          () => globalThis.__state === 1 || globalThis.__error !== null,
          null,
          {
            timeout: 15000,
          },
        );
      } catch {
        console.log('  TIMEOUT waiting for ready/playing/error — treating as failed.');
      }
      const result = await page.evaluate(() => ({
        state: globalThis.__state,
        error: globalThis.__error,
        duration: globalThis.__duration,
        seekedTo: globalThis.__seekedTo,
      }));
      if (result.error !== null) {
        const restricted = result.error === 101 || result.error === 150;
        anyRestricted = anyRestricted || restricted;
        console.log(
          `  RESULT: onError fired with code ${result.error}${restricted ? ' (EMBEDDING RESTRICTED)' : ' (other error)'}`,
        );
      } else if (result.state === 1) {
        console.log(
          `  RESULT: PASS — reached PLAYING. duration=${result.duration?.toFixed(1)}s, started at ${result.seekedTo?.toFixed(1)}s.`,
        );
        await page.waitForTimeout(1200); // let a real frame or two render before the screenshot
        const shotPath = path.join(OUT_DIR, `${viewport.name}-${video.id}.png`);
        await page.screenshot({ path: shotPath });
        console.log(`  Screenshot saved: ${shotPath}`);
      } else {
        console.log(`  RESULT: did not reach PLAYING (state=${result.state}).`);
      }

      // Close (destroy) then reopen (recreate) the same player, confirm it plays again.
      await page.evaluate(() => globalThis.__destroyPlayer());
      await page.waitForTimeout(200);
      await page.evaluate((id) => globalThis.__makePlayer(id), video.id);
      try {
        await page.waitForFunction(
          () => globalThis.__state === 1 || globalThis.__error !== null,
          null,
          {
            timeout: 15000,
          },
        );
        const reopened = await page.evaluate(() => ({
          state: globalThis.__state,
          error: globalThis.__error,
        }));
        console.log(
          reopened.state === 1
            ? '  Reopen: PASS — playing again after destroy+recreate.'
            : `  Reopen: did not reach PLAYING (state=${reopened.state}, error=${reopened.error}).`,
        );
      } catch {
        console.log('  Reopen: TIMEOUT.');
      }
      await page.evaluate(() => globalThis.__destroyPlayer());
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(
  anyRestricted
    ? '\nEMBEDDING RESTRICTION DETECTED on at least one video — see RESULT lines above.'
    : '\nNo embedding restriction detected on either video.',
);
