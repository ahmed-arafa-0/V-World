# Beach Ocean Viewer — YouTube IFrame Player API — Evidence

**Date:** 2026-09-23
**Authorization:** Ahmed, directly in this conversation — "This authorizes a YouTube provider for
this ocean viewer only." No commit, push, or deployment was performed.

## 1. Verification before labeling (done first, as instructed)

Checked both video ids two independent ways before assigning any day/sunset label:

1. **YouTube oEmbed** (`https://www.youtube.com/oembed?...`) — both returned `200 OK` (a reasonable
   embeddability signal) with titles:
   - `8HDjaAV_12s` → *"Turquoise Ocean off Seychelles Island. Ocean waves 4K Ultra HD"*
   - `C_Edf-nAc6g` → *"Deep Orange Sunset on a Remote Beach with Rolling Ocean Waves..."*
2. **Real embedded playback + screenshot**, via a standalone Playwright harness using the exact same
   IFrame Player config as the shipped component (see §5) — both videos visually confirmed:
   `8HDjaAV_12s` is bright turquoise water/blue sky (daytime); `C_Edf-nAc6g` is a deep-orange sky over
   dark water (sunset). Screenshots saved to `test-results/ocean-youtube/*.png`.

**Conclusion, verified not assumed:** `OCEAN_DAYTIME_VIDEO_ID = '8HDjaAV_12s'`,
`OCEAN_SUNSET_VIDEO_ID = 'C_Edf-nAc6g'`. The viewer defaults to the daytime clip (`OCEAN_VIDEO_ID`).
Both ids are exported from `OceanView.tsx` so a future day/sunset selector doesn't have to re-verify
which is which — no such selector was built, since none was asked for and the earlier
`CODEX_HANDOFF.md` explicitly named "a second selectable daytime/sunset clip" as needing its own
explicit runtime/config decision.

## 2. What changed

- **`apps/web/src/features/world/youtubeIframeApi.ts`** (new): a minimal loader for
  `https://www.youtube.com/iframe_api` (loads at most once) plus the small ambient types this one
  player actually uses — no `@types/youtube` dependency added.
- **`apps/web/src/features/world/OceanView.tsx`** (rewritten): the same shell-triggered, full-screen
  dialog (`onClose`, Escape key, `ocean-close` Back button — all unchanged in shape/testids), now
  driven by a `YT.Player` instead of a native `<video>`/Drive-gateway media ref.
- **`packages/contracts/src/world-ui-text.ts`**: one new fallback UI-text key, `ocean_restricted` (5
  locales), for the honest embedding-restricted message — reusing the existing generic `cafe_play`
  ("Play") label for the explicit-play control rather than inventing a new one.
- **`apps/web/tests/reviewCorrectio ns.test.tsx`**: the old "Beach ocean view" tests, which asserted
  on `env.assets`/a native `<video src>`, were necessarily rewritten (with a fake `window.YT` mock,
  never touching the real network) to match the new player — this is expected, in-scope test
  maintenance for the exact behavior this task intentionally replaced, not the same pre-existing
  "Church interior" candle-test failures flagged in the previous report (still present, still
  unrelated, still untouched — see §6).

**Explicitly not touched, per instruction:** `10_ASSETS`'s `map_ocean_loop` row and the Map's
top-down ocean video (`MapView.tsx`) — both still served through the Drive/media-gateway pipeline,
untouched. No YouTube id was written into any Drive-file-ID field anywhere. The beach shell
marker/reward logic in `WorldExperience.tsx` was not touched. No new live-Sheet writes or review
players were created for this task (see §5 — verification used a standalone harness hitting YouTube
directly, not the app's backend).

## 3. Behavior implemented, against each requirement

| Requirement | Implementation |
| --- | --- |
| Poster before playback | `ocean-poster` `<img src="https://i.ytimg.com/vi/<id>/hqdefault.jpg">`, shown only until the player actually starts rendering frames (`onStateChange` → PLAYING) |
| Load the player only when the viewer opens | `YT.Player` is constructed inside a `useEffect` that runs on mount (the shell marker is this component's only entry point) |
| Random valid start point after obtaining actual duration | `onReady` reads `event.target.getDuration()` (the real duration — 11h54m55s for the daytime clip, 3h00m12s for the sunset clip, confirmed live), then `randomStartSeconds()` picks a point in `[0, duration)` (leaving a short tail), then `seekTo(at, true)` |
| Keep the complete video available; don't clip it | no `start`/`end` playerVars are set; `loop:1` + `playlist:<id>` is the officially documented way to loop a single full video without truncating it |
| Let YouTube manage buffering/quality | no `vq`/quality param set; only `autoplay`, `mute`, `controls`, `playsinline`, `loop`, `playlist`, `rel` |
| Explicit Play control if autoplay is blocked | a 1.5 s grace timer after `playVideo()`; if `getPlayerState()` still isn't `PLAYING`, an `ocean-play` button (reusing the existing "Play" fallback text) appears and calls `playVideo()` again (now inside a real user gesture) |
| Back/Escape available during loading and errors | the Back button and the `Escape` keydown listener are rendered/attached unconditionally, independent of `state` |
| Destroy the player on close | the effect's cleanup calls `player.destroy()` (also on retry, before creating a fresh instance) |
| Don't obscure YouTube branding/controls/ads | the poster is removed the moment the player is actually playing; the "blocked" Play control never appears **on top of** a poster (poster is poster-only during the pre-ready `loading` state, not during `blocked`), so YouTube's own paused/thumbnail UI is never covered; no `modestbranding` param is set |
| Handle embedding restrictions honestly, with retry | `onError` with code `101`/`150` (YouTube's own "owner disabled embedding" codes) sets an honest `ocean_restricted` message with a `try_again` retry button that destroys and recreates the player |

**One real bug found and fixed via the screenshot check (§5):** the player initially had no explicit
`width`/`height`, which YouTube defaults to a fixed 640×390 px iframe. Screenshot review caught this;
`width: '100%', height: '100%'` was added (an `<iframe>`'s width/height attributes are one of the few
places the HTML spec honors percentage strings), confirmed by a second, correctly full-viewport
screenshot afterward.

## 4. Audio — preserved

`mute: 1` keeps the ocean loop silent, exactly matching the existing behavior it replaces (the old
native `<video muted loop>`) — this preserves the existing Walkman/Church audio rules untouched, per
the instruction; nothing about mute/Church-silence/Walkman-ducking logic elsewhere was touched.

## 5. Verification performed

- **Standalone real-browser harness** (`scripts/verify-ocean-youtube-playback.mjs`, new): loads the
  real `https://www.youtube.com/iframe_api` (genuine network call, no mocking) with the exact same
  `playerVars`/`width`/`height` the shipped component uses, for **both** video ids, on **both** a
  desktop (1280×720) and a mobile (`iPhone 13` emulation) Playwright viewport:
  - both videos reached the real `PLAYING` state (not just "no error") on both viewports;
  - **no embedding restriction (error 101/150) on either video, on either viewport**;
  - a screenshot was captured per video/viewport and visually reviewed (§1) — this is what caught
    the 640×390 sizing bug and confirmed the fix;
  - closing (`player.destroy()`) then reopening (`new YT.Player(...)`) the same video was exercised
    for every case above and confirmed to reach `PLAYING` again.
  - This harness talks to YouTube directly (a tiny local static page), not through the React
    component tree or the app's backend — it verifies the real IFrame API behavior/config, not the
    React wiring.
- **Component-level tests** (`apps/web/tests/reviewCorrections.test.tsx`, rewritten "Beach ocean
  view" describe block, 7 tests, all passing): exercise the actual `OceanView` component tree with a
  fake, network-free `window.YT`, proving: poster shown then hidden on PLAYING; player created with
  the exact daytime video id and `mute`/`loop`/`playlist`/`autoplay` vars; `getDuration`/`seekTo`
  wiring and the returned seek value is within `[0, duration)`; the blocked-autoplay Play control
  appears (and never alongside the poster) and re-triggers `playVideo()`; the `101`/`150`
  embedding-restricted path shows the honest retryable message; retry destroys the old player and
  creates a fresh one; unmount destroys the player.
- **Not performed**: an end-to-end run through the actual beach shell interaction inside the real
  game (would require standing up the full backend + a review-player session positioned at the
  Beach's shell marker). The shell-trigger wiring itself (`WorldExperience.tsx`'s `markerId ===
  'shell'` → `setOcean(true)` → renders `<OceanView>`) was not modified in this task, and is exactly
  what already routed to the pre-existing ocean viewer — only `OceanView`'s internals changed.

## 6. Tests / typecheck / lint / build

- `npm run typecheck` — clean.
- `npm run lint` — clean (including the new verification script, after replacing `window.` with
  `globalThis.` inside its Playwright `page.evaluate()` callbacks, which the Node-scoped ESLint
  config for `scripts/**/*.mjs` doesn't recognize as a browser global — cosmetic, no behavior change).
- `npm run build` — clean.
- `npm run test --workspace=apps/web`: **405/409 passed.** The same 4 pre-existing failures already
  flagged in `docs/reports/CONTENT_BANKS_V1_AND_CHURCH_AUDIO_EVIDENCE.md` §9 remain (Church-interior
  candle-tray tests, unrelated file, unrelated feature, not touched here). Net: −4 old Ocean tests, +7
  new Ocean tests since the previous report.
- `npm run test --workspace=apps/functions` was not re-run for this task (nothing under
  `apps/functions` was touched).

## 7. Explicit confirmations

- No YouTube id was written into any Drive-file-id field; `10_ASSETS.map_ocean_loop` is untouched.
- The beach shell reward rule and `WorldExperience.tsx`'s marker handling are untouched.
- No new review-player rows or sessions were created on the live Sheet for this task — verification
  used a standalone harness talking to YouTube directly.
- No embedding restriction was found on either video, on either viewport.
- No commit, push, or deployment was performed.
