# Dialogue activation, story images, Church mute control, and preview rebuild — Evidence

**Date:** 2026-09-23
**Authorization:** Ahmed, directly in this conversation — "Ahmed already authorized activating the
supplied content and reviewing it later." Closes four concrete gaps left open by
`docs/reports/CONTENT_BANKS_V1_AND_CHURCH_AUDIO_EVIDENCE.md`. No commit, push, or deployment was
performed.

## 1. First-journey dialogue — the exact 80 rows, enabled

**Exact scope identified from code, not guessed:** the 16 `group_id`s in
`apps/functions/src/services/content-completion-v1-dialogue-seed.service.ts`'s
`DIALOGUE_GROUP_PROPOSALS` (`dlg_boot`, `dlg_var_reveal`, `dlg_gate_open`, `dlg_beach`, `dlg_church`,
`dlg_cafe`, `dlg_walkman`, `dlg_arcade`, `dlg_cottage`, `dlg_marcelino`, `dlg_first_message`,
`dlg_farm`, `dlg_museum`, `dlg_hall`, `dlg_map_unlock`, `dlg_freedom`) × 5 locales = the 80 rows that
file's own doc comment says it inserted `enabled: 'FALSE'` — "this seed inserts the text; it does
not turn any of it on." `dlg_gate`/`dlg_naming` (the pre-existing 7 rows) are not in that proposal
list at all, so they are structurally impossible to touch from this change.

**What changed:** new `apps/functions/src/services/content-completion-v1-dialogue-activate.service.ts`
(the existing seed file is **not modified**) exports `activateDialogueGroupProposals`, which reuses the
seed file's own exported `buildDialogueGroupRows()` purely to derive the 80 target row ids, then calls
`gateway.updateByPrimaryKey('15_DIALOGUE', id, { enabled: 'TRUE' })` only for rows not already `TRUE`.
New script `scripts/enable-dialogue-groups.mjs` (`npm run enable:dialogue-groups`), run once against
the real Sheet.

**Live result** (`scripts/enable-dialogue-groups.mjs`, then a read-only re-check):

|                                             | Before |             After |
| ------------------------------------------- | -----: | ----------------: |
| `15_DIALOGUE` total rows                    |     87 |    87 (no insert) |
| Rows `enabled: TRUE`                        |      7 |            **87** |
| `dlg_gate` (5 rows) / `dlg_naming` (2 rows) | `TRUE` | unchanged, `TRUE` |

(A first run hit a transient `SHEET_RATE_LIMITED` after ~68 of 80 writes — the two live preview
servers, §4, were polling the same Sheet concurrently. Re-running with the gateway's production
pacing (`maxRequestsPerMinute: 52`, matching `gateway-context.ts`) completed the remaining 12
idempotently; the read-only re-check above confirms the final state, not just the last run's log.)

**Verified end-to-end through the real backend** (not a fixture): `GET /api/content/runtime?refresh=1`
against the real, running preview (port 5051) now returns all 87 dialogue rows across **18** distinct
`groupId`s (the 2 pre-existing + all 16 newly-activated), including `dlg_church`'s 5 locales with the
exact authored text ("Here we are at the church door... I'll wait here outside." / Arabic / Italian /
Greek / French).

**Verified in the real, rendered UI** (Playwright, Firefox, a fresh isolated `jfix_*` test player —
never `veoulla` — against port 5050; screenshots in `docs/reports/DIALOGUE_IMAGES_AUDIO_LIVE/`):

- `01-church-doorway.png`: the Beach's Church-approach view, with the companion (VAR, the white cat)
  standing on the path — confirming the companion stays **outside** at the doorway moment.
- `02-church-story-image.png`: taken just after transitioning into the Church place — the doorway
  line ("وصلنا باب الكنيسة... أنا هستناكي هنا بره" / "We've reached the church door... I'll wait here
  outside") is visible as the bottom narration bar with its own Continue control, **simultaneously**
  with the Church's Story panel open — i.e. `beat_07_church`'s narration (`locationId: 'church'`)
  renders on arrival at the Church place itself, not out on the Beach; the companion-stays-outside
  guarantee is structural (`ChurchView.tsx`/`CandleCorner` never render `<Companion />` at all — a
  separate assertion in the same run, "companion should not be rendered inside the Church", passed).
- A dedicated component test suite already covers the generic narration mechanism
  (`apps/web/tests/world.test.tsx`'s "beat narration (text-only, player-paced)" — advances only on the
  player's own Continue, never auto-dismissed) and was exercised, unmodified, against this real data.

**Recorded honestly, not overclaimed:** this activation is recorded as **"authorized by Ahmed,"** not
"every line individually reviewed" — `15_DIALOGUE` has no `review_status` column at all (only
`enabled`), so there is no field to mark "reviewed" even if that were the claim being made.

## 2. Story images — 50/50 discovered, registered, and linked

**Exact scope:** `assets/Veoulla_Content_Banks_v1/asset_manifest.json` — 50 entries, each
`asset_id`/`story_id`/`filename`/`mime_type: image/png`, with matching local PNGs under
`assets/Veoulla_Content_Banks_v1/images/`.

**What changed:** new `apps/functions/src/services/church-story-image-seed.service.ts` (same
discover-by-filename-under-the-configured-Drive-root → upsert `10_ASSETS` shape as
`church-audio-media-seed.service.ts`), plus a second step patching
`30_CHURCH_CONTENT.image_asset_ids` — on **every** `content_row_id` sharing a story's `content_id`
(since that column is per-locale-row, not per-story), and only where currently blank, so a value
already set by hand is never overwritten. New script `scripts/seed-church-story-images.mjs`
(`npm run seed:church-story-images`), which reads the manifest itself (never embeds/guesses filenames)
and passes it into the service.

**Live result:**

|                                                 | Result                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Files expected                                  | 50                                                                                        |
| Files found under the configured Drive root     | **50 / 50** (0 missing — no filenames to report)                                          |
| `10_ASSETS` image rows created/confirmed        | 50, all `asset_type: image`, `enabled: TRUE`                                              |
| `30_CHURCH_CONTENT` story rows linked           | 62 / 62 (15 for the 3 five-locale preserved stories + 47 for the Arabic-only new stories) |
| Rows with blank `image_asset_ids` after the run | **0**                                                                                     |

**Verified end-to-end, live rendering, for today's scheduled story** (`church_story_creation_001`,
Arabic, 2026-09-23):

- `POST /api/world/church/enter` (locale `ar-EG`, real backend, real Sheet) returns
  `story.imageRefs: ['/api/media/church_story_creation_001_image?v=1']`.
- `GET` on that exact URL returns **`200 image/png`**, streamed through the real media gateway — not
  merely "a reference exists," an actual image byte stream.
- Confirmed again in a real rendered browser: `02-church-story-image.png` shows the open Story panel
  with the real `<img>` painted on screen, title "جمال البداية", reference "Genesis 1:1-31" — exactly
  the manifest's `church_story_creation_001` entry.

## 3. Church sound — mute/unmute control

**What changed** (`apps/web/src/features/world/views/ChurchView.tsx`, new
`apps/web/src/features/world/churchAudioPreference.ts`, `packages/contracts/src/world-ui-text.ts`):

- A toggle button (`church_mute_audio`/`church_unmute_audio`, 5 locales, `aria-pressed`, `data-testid="church-mute-audio"`)
  sets `audio.muted` on the existing `readingAudio` ref via a small dedicated effect — the pre-existing
  mount effect (creates the `Audio`, sets volume `0.05`, loop) and the play effect are both untouched.
- Persisted per-user via `localStorage` (`vw_church_audio_muted_v1:<userId>`, same key convention as
  `candleRecovery.ts`'s `storageKey`), read once on mount so a saved preference applies before the
  first frame.
- Rendered in **both** Church views: inline in the interior, and through `CandleCorner`'s existing
  `audioNotice` slot for the candle corner.
- No change to `walkman.silence(true/false)` (still fires on mount/unmount only), no `<Companion />`
  added anywhere in `ChurchView.tsx`/`CandleCorner` (cat exclusion preserved), no change to
  `fadeOutAndStop` (fade-then-pause on `church-leave` and on unmount is unaffected by the mute flag).

**Bug found and fixed via live verification, not assumed correct:** the new button (and the
pre-existing `enable_audio` tap-to-enable button, which already had the same defect) had no
positioning CSS — both are plain, unpositioned children inside `<Stage>`'s absolutely-positioned full-
bleed container, so they rendered stacked on top of the centred place title. First live screenshot
(`docs/reports/DIALOGUE_IMAGES_AUDIO_LIVE` from before the fix, not kept) showed the mute label
overlapping "الكنيسة" (Church). **Fix:** new `.churchAudioControls` class
(`apps/web/src/features/world/world.module.css`) positions both buttons as a small column, vertically
centred on the right edge — clear of both the top place title and `.narration`'s full-width bottom
strip (`inset-inline: 0; bottom: 0`, which a second live run showed the bottom-right corner is _not_
clear of). Re-verified live after the fix: `03-church-muted.png` shows the button correctly clear of
all other chrome, label correctly switched to "شغّلي القراءة تاني" (Unmute) after toggling.

**Verified:**

- 4 new component tests (`apps/web/tests/reviewCorrections.test.tsx`, "Church audio mute control"):
  renders unmuted by default with the correct accessible name, toggles `aria-pressed`/label on click,
  also appears (and reflects the same state) inside the candle corner, does not render at all when no
  Gospel-reading track is configured, persists a saved preference across a fresh mount, and still
  reaches `onLeave` (fade-then-pause) while muted.
- Live, real browser (Firefox, after the CSS fix): mute button visible and correctly positioned in the
  Church interior, click toggles `aria-pressed` (no timeout — confirmed the earlier positioning bug is
  what was blocking the click, not application logic), label switches to the localized "Unmute" string.
- Not independently re-verified in this pass inside the candle-corner specifically in a **real
  browser** (only via the component test) — time-boxed given the interior check plus the component
  test already cover the same rendering code path (`audioNotice` renders the identical button
  elements).

## 4. Preview identification, rebuild, and restart

**Identified without inferring from port number alone** — both servers were **confirmed actually
running** before any action, via `netstat`/process command line, not assumed from prior reports:

| Port | PID (before) | Process                                                            | Identity signal                                                                                                                      |
| ---- | ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 5050 | 20144        | `scripts/serve-local-preview.mjs` (running since 2026-09-22 11:21) | No `X-Review-Player` header — the real, un-isolated production identity. **This is Ahmed's intended preview.**                       |
| 5051 | 44016        | `scripts/serve-fresh-review.mjs` (running since 2026-09-23 03:30)  | `X-Review-Player: manual_review_1790065059494` — an isolated QA sandbox for a single fixed test identity, distinct from Ahmed's own. |

Both were serving a build from 00:47 that morning — stale relative to this task's changes regardless
of which one Ahmed actually watches.

**Action taken:** `npm run build` (twice — once for the feature work, once more after the mute-button
CSS fix discovered during live verification), then both processes were stopped and restarted with the
fresh build each time (`node scripts/serve-local-preview.mjs` on 5050, `node scripts/serve-fresh-review.mjs`
on 5051). Both came back on the same ports; 5051 reused its existing `manual_review_1790065059494`
identity from `test-results/review-repair/fresh-review.json` (no player state reset). Restarting a
backend process does not touch browser windows or in-Sheet player state, so nothing existing was lost.
Final confirmation: both `/api/health` return `200`; 5051 still carries its `X-Review-Player` header;
5050 does not.

**Exact URL for Ahmed's preview: `http://127.0.0.1:5050`** (real Sheet, real read-only Drive
credential, his own `veoulla` session/cookie untouched by any of this work).

## 5. Regression checks

- `npm run format:check` — same pre-existing, unrelated CRLF/LF drift (~69 files, confirmed already
  present before this session) as the prior report; every file this session touched is clean.
- `npm run lint` — clean.
- `npm run typecheck` — clean (contracts, sheet-schema, functions, web).
- `npm run build` — clean, twice.
- `npm run test` (full workspace): **596/596** functions tests, **414/414** web tests. Both of the
  previously-flagged pre-existing failures from the last report
  (`media-api.test.ts`'s Drive-stream-error test; `reviewCorrections.test.tsx`'s Church candle-tray
  group) **now pass** — already fixed by other in-flight work before this session started; not touched
  or claimed as fixed by this task.
- New tests added this session: 3 (`content-completion-v1-dialogue-activate.service.test.ts`) + 4
  (`church-story-image-seed.service.test.ts`) + 4 (Church audio mute, in `reviewCorrections.test.tsx`)
  — all passing.
- Live-Sheet verification was bounded and non-repeated per area: one activation run (+ one retry after
  a rate limit) for dialogue, one seed run (+ one retry after a rate limit) for images, one
  `content/runtime` read, one `church/enter` read, one `media` HEAD, and 5 short, isolated
  (`jfix_*`) Playwright browser passes total across the whole debugging arc for the doorway/mute
  investigation — no full first-journey walk was re-run (that evidence already exists in
  `docs/reports/MANUAL_JOURNEY/REPORT.md` and is unaffected by this task's changes).
- Playwright `tests/e2e/*.spec.ts`: none reference Church/dialogue/story-image, so none were run.

## 6. Explicit confirmations

- Every Sheet write used `updateByPrimaryKey` (single-row patch) or `appendRow` (single new row) —
  never a full-tab rewrite.
- `msg_welcome_ahmed`, the `church_verse_001` Birthday Verse placeholder, the 16
  `reserve_previous_16` quiz questions, and the 50 undated celebration messages were never read or
  written by this task.
- No `22_KEY_RULES`/`23_ACHIEVEMENTS` row was touched; no achievement, key, or reward was invented or
  altered.
- No later milestone/feature was started.
- No reset of any player's progress. 5 short-lived, isolated `jfix_*` rows were added to the real
  Sheet by the live-browser verification passes (never `veoulla`), matching this repo's existing,
  already-accepted convention (`scripts/verify-manual-journey-live.mjs`); one existing isolated
  `manual_review_1790065059494` review player had a fresh session minted for it (no new rows).
- No commit, push, or deployment was performed.

## 7. Changed/added files

**New:**

- `apps/functions/src/services/content-completion-v1-dialogue-activate.service.ts`
- `apps/functions/src/services/church-story-image-seed.service.ts`
- `apps/functions/tests/content-completion-v1-dialogue-activate.service.test.ts`
- `apps/functions/tests/church-story-image-seed.service.test.ts`
- `apps/web/src/features/world/churchAudioPreference.ts`
- `scripts/enable-dialogue-groups.mjs`
- `scripts/seed-church-story-images.mjs`
- `scripts/verify-dialogue-images-audio-live.mjs`
- `docs/reports/DIALOGUE_IMAGES_AUDIO_LIVE/` (screenshots + results.json from the live verification runs)
- `docs/reports/RELEASE_CHECKLIST.md`
- `docs/reports/DIALOGUE_IMAGES_AUDIO_PREVIEW_EVIDENCE.md` (this file)

**Edited:**

- `apps/web/src/features/world/views/ChurchView.tsx` (mute control)
- `apps/web/src/features/world/world.module.css` (`.churchAudioControls`)
- `packages/contracts/src/world-ui-text.ts` (`church_mute_audio`/`church_unmute_audio`)
- `apps/web/tests/reviewCorrections.test.tsx` (Church audio mute tests, `churchState` extended with an
  optional `gospelReadingAudioRef` param)
- `package.json` (two new `enable:`/`seed:` scripts)
- `docs/plans/TECHNICAL_CLOSURE.md` (§6 note that the dialogue/story-image portions of its carry-over
  list are now closed)
