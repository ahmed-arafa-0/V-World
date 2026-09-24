# Content Banks v1 import, media registration, and Church audio/Ocean review — Evidence

**Date:** 2026-09-23
**Authorization:** Ahmed, directly in this conversation — explicitly superseding
`assets/Veoulla_Content_Banks_v1/CODEX_HANDOFF.md`'s "no live writes authorized by this handoff
alone" restriction for this specific content/media import only. No commit, push, or deployment was
performed, per his instruction.

## 1. What was imported (live writes)

All writes used `SheetGateway.appendRowsIfAbsent` (pure insert, idempotent by primary key — safe to
re-run) or `appendRow`/`updateByPrimaryKey` (media upsert). A read-only re-inspection after writing
(`scripts/inspect-real-content-gaps.mjs`) confirmed every new-row count landed exactly once, with
zero collisions:

| Tab | Before | After | New rows | What |
| --- | ---: | ---: | ---: | --- |
| `30_CHURCH_CONTENT` | 2 | 364 | 362 | 15 (3 preserved stories × 5 locales, `content-completion-v1-church-seed.service.ts`, unmodified) + 47 new stories (Arabic-only) + 300 verses (Arabic-only) |
| `19_MESSAGES` | 6 | 1006 | 1000 | 950 daily-scheduled + 50 occasion-only (unscheduled) |
| `31_CHURCH_QUIZ` | 2 | 342 | 340 | 316-question bank + 24 net-new starter locales, now **scheduled** (see §3) |
| `15_DIALOGUE` | 7 | 87 | 80 | 16 missing first-journey dialogue groups × 5 locales (`content-completion-v1-dialogue-seed.service.ts`, unmodified — reconciling the earlier package per Ahmed's "reconcile the content-completion package too") |
| `08_UI_TEXT` | 867 | 1160 | 293 | 18 beat titles + 40 labels + 3 `ui_map` locale fills (`content-completion-v1-ui-text-seed.service.ts`, unmodified) |
| `10_ASSETS` | 92 | 95 | 3 | `audio_church_bell_exterior`, `audio_church_gospel_reading`, `asset_audio_song_tul8te_001` |
| `20_SONGS` | 3 | 4 | 1 | `song_tul8te_001` (Café/Walkman) |

**Explicitly not touched:** the live `church_verse_001` Birthday Verse row (still its placeholder
text, `title: "Birthday Verse"`, `active_date: 2026-09-26`, `enabled: FALSE`) — verified untouched by
direct read after the import. The approved welcome message (`msg_welcome_ahmed`, 5 locales) is
unchanged. No `22_KEY_RULES`/`23_ACHIEVEMENTS` row was touched; the quiz's existing
`ach_perfect_quiz`/`key_candle` reward is reused unchanged, per Ahmed's explicit instruction.

## 2. Review-state honesty (the actual decision made, flagged for correction)

`31_CHURCH_QUIZ`/`30_CHURCH_CONTENT`'s only visibility gate in `church.ts`'s `isApproved()` is
`enabled === true && review_status === 'approved'` — there is no fifth "authorized but not
individually reviewed" value in `39_VALIDATION_LISTS.review_status` (`draft` / `pending_review` /
`approved` / `rejected`). Ahmed's instruction was to make this content actually live on a schedule
("make approved-for-use content available through the existing scheduling and locale rules"), which
is only possible with `review_status: 'approved'`. **I used `'approved'` for all newly-scheduled
content-bank-v1 rows** (stories, verses, the 300 new-batch quiz questions) to reflect "authorized for
import/use by Ahmed," not a claim that each sentence was individually edited. If this reading is
wrong, the fix is a bulk `review_status` column edit in the Sheet — no code change needed.

The 16 `reserve_previous_16` quiz questions and the 50 occasion-only messages are left
`enabled: FALSE` / undated / `pending_review` (quiz) exactly as their source packages proposed —
untouched by the scheduling decision.

## 3. Scheduling actually applied (concrete, using the authoritative game clock)

Computed via `getAuthoritativeTimeZone` (live value: `Africa/Cairo`) + `calendarDateKey`, **not** the
machine clock or package creation date. Schedule start = the day after the run (2026-09-23, which is
now today). `2026-09-26` (the Birthday Verse's date) is skipped on every rotation below, so nothing
generic ever lands on that day.

- **Verses**: 300 verses, one per calendar day, 2026-09-23 → onward (skipping 09-26).
- **Stories**: 47 new stories, one per calendar day, same window.
- **Messages**: 950 normal messages, one per calendar day, round-robin across the 19 non-celebration
  categories (variety from day 1, not 50 mornings in a row). The 50 celebration messages are
  inserted but **undated and disabled** — no occasion dates exist yet to attach them to.
- **Quiz**: reused `assets/Veoulla_Content_Completion_v1/quiz_schedule_proposal.json`'s own fixed
  50-day, 6-question/day (1 MC + 1 TF × easy/medium/hard) rotation unchanged, mapped onto real
  calendar dates starting 2026-09-23. The 16 "previous" questions stay reserved/unscheduled exactly
  as that proposal names them — not a rotation I invented.

This is a **proposed, concrete schedule**, not a claim that this is the only reasonable one — it is
easy to re-date by editing `active_date`/`delivery_at` cells directly in the Sheet; nothing about the
seed re-run depends on these particular dates.

## 4. Reconciliation with the earlier packages (no duplicates)

- **3 preserved stories** (`church_story_storm_001`/`sheep_001`/`samaritan_001`): content-banks-v1's
  copies of these (Arabic-only, `origin: "previous_3_preserved"`) were **filtered out** of the new
  import (`buildContentBankStoryRows` skips them) — the existing 5-locale, already-translated
  versions from `content-completion-v1-church-seed.service.ts` were kept instead, since replacing
  them with an Arabic-only version would have been a translation downgrade, not a no-op.
- **Quiz bank**: rather than running the earlier undated/disabled `content-completion-v1-quiz-seed`
  and then a second activation pass, I wrote one new scheduled build (`buildScheduledQuizRows`) from
  the same already-schema-mapped source files, so the bank landed dated/enabled in a single write.
- Multi-Bible-reference quiz questions (11 of 316) were already `"; "-joined` in
  `quiz_import_preview_316_ar.json` by the prior session's work — copied through unchanged.

## 5. Media registered (Drive discovery — read-only, no uploads)

All 3 files were found **uniquely** under the approved Drive root with real, correct MIME
(`audio/mpeg`); no filename collided, nothing was guessed:

| File | Asset ID | Location | Registered as |
| --- | --- | --- | --- |
| `Church Bell Sound Effect.mp3` | `audio_church_bell_exterior` | church | one-shot bell, Church exterior arrival |
| `church.mp3` | `audio_church_gospel_reading` | church | Gospel reading (replaces hymn) |
| `TUL8TE Wala Ash Wala Kan.mp3` | `asset_audio_song_tul8te_001` | cafe | backs new `song_tul8te_001` |

`song_tul8te_001`'s `title` is taken verbatim from the filename ("Wala Ash Wala Kan"); `artist` is
left blank — not invented — since no attribution was supplied for this specific file (the separate
`MUSIC_AND_REMAINING.md` listening links are unrelated suggestions, not this file's credits).

## 6. Church audio — product decision implemented

Recorded as a new dated, layered decision in the Living Bible, **`§18B-1`**
(`docs/Veoullas_World_Living_Bible.md`), following the same "supersede, don't silently overwrite"
pattern as `§3A-1`, because it changes a previously-**Locked** §18B bullet ("no background hymn
auto-plays... only after deliberate user interaction"). Flagging this explicitly per CLAUDE.md §13,
since it is a genuine change to Locked prior content, made on Ahmed's own explicit instruction in
this conversation.

Implementation (`apps/web/src/features/world/views/ChurchView.tsx`,
`apps/functions/src/world/church.ts`, `packages/contracts/src/world.ts`):

- The hymn feature (hotspot, panel, tap-to-play `Audio` object) is **removed** from the player
  experience. `20_SONGS`/`location_id: church` rows and the backend `hymns` field are left in place,
  untouched — nothing is deleted, matching CLAUDE.md's no-destructive-migration spirit.
- `ChurchStateResponse.gospelReadingAudioRef` (new field) resolves `audio_church_gospel_reading`
  server-side, same as every other media reference — never a raw Drive ID.
- A single `Audio` object, created once when `ChurchView` mounts, plays at 5% volume for as long as
  the view is mounted — which in this codebase's actual structure means exactly "the interior or the
  candle-corner close-up," the only two backgrounds `ChurchView` ever renders (confirmed by reading
  the component: the other panels — verse/story/quiz/etc. — are overlays on the same interior
  background, not separate scenes). This means it **never restarts** switching between the two named
  views, without needing to special-case `open`.
- Leaving the Church (`church-leave` hotspot) fades it out via the existing `fadeOutAndStop` helper
  (unchanged, previously used for the hymn); the unmount cleanup effect does the same as a backstop.
- A blocked/rejected autoplay shows the same `enable_audio` tap-to-enable control already used by
  `Ambience.tsx`, rendered in both the interior and candle-corner branches (no new UI text needed).
- **Walkman pause behavior needed no code change** — `useWalkman.tsx`'s existing `silence()` already
  documents and implements exactly the requested behavior ("Entering pauses at once and keeps the
  track position; leaving does NOT [auto-resume]").
- **Bell on Church-exterior arrival** (`WorldExperience.tsx`): a new edge-triggered effect fires only
  when `place` actually transitions to the Beach's `church_focus` node (the church approach, before
  the door) — not on every re-render, so revisiting doesn't re-ring it. A rejected/blocked one-shot
  is silently dropped, consistent with respecting browser audio-gesture policy.

**Live-verified** (§7): `POST /api/world/church/enter` for a real, isolated session returns a
resolved, playable `gospelReadingAudioRef` (`/api/media/audio_church_gospel_reading?v=1`).
**Not independently verified in a real browser** in this session (no headless-browser autoplay/volume
check was run) — see §8.

## 7. Ocean — no code change needed

Read `apps/web/src/features/world/OceanView.tsx` in full against every stated requirement:

| Requirement | Already implemented |
| --- | --- |
| Poster-first | `poster={asset?.hasPosterVariant ? ... : undefined}` |
| Progressive playback through the media gateway, no Blob/service-worker fetch | native `<video src>` streaming against `/api/media/...`, which already supports byte-range requests (`apps/functions/src/http/byte-range.ts`) |
| Random seeking | `randomStart()`, seeks within `video.seekable` on `loadedmetadata` |
| Loading feedback | `loading`/`playing`/`failed` states with visible copy |
| Retry | `ocean-retry` button, cache-busting `&retry=N` |
| Cancellation on exit | unmount effect: `pause()` + `removeAttribute('src')` + `load()` |
| Full duration kept | player never trims; whatever duration the registered asset has plays in full |

`beach_ocean_eye_level_loop` still has no `10_ASSETS` row — per Ahmed's own instruction, actual
full-video registration waits for his files, so this is correctly still absent, not a bug.

## 8. Verification performed

- **Read-only Sheet inspection** before and after every write (`scripts/inspect-real-content-gaps.mjs`) —
  exact row counts matched expectations with zero collisions (§1).
- **Live, isolated-account API verification** (`scripts/verify-content-banks-v1-live.mjs`, new): minted
  an isolated `manual_review_<timestamp>` test player (never `veoulla`) with a fresh session against the
  **real production Sheet**, exactly like the repo's existing `prepare-manual-review-player.mjs`
  convention, then, through the actual running app (not a fixture):
  - confirmed `gospelReadingAudioRef` resolves to a real playable media URL;
  - confirmed today's scheduled verse and story are visible (Arabic locale) — content scheduling
    genuinely works end-to-end;
  - confirmed English-locale requests honestly see nothing yet (no translation exists — working as
    designed, not a bug);
  - confirmed **0 of 1000** `veoulla`-recipient content-bank-v1 messages are visible to the isolated
    account (recipient isolation holds), checked against the real unmapped production gateway.
  - This left one (harmless, standing, by-convention) extra `manual_review_*` test player row in the
    Sheet — the same thing `prepare-manual-review-player.mjs` does routinely; **Ahmed's own review
    progress/session was never read or touched**.
- **Not performed**: a real headless-browser (Playwright) check of Church audio autoplay/volume/
  no-restart, mute, and Walkman-control visuals, and a live Café/Walkman UI check of the new song.
  Time-boxed out of this pass. The underlying logic was verified by direct code reading (§6) and the
  media ref resolves live (above), but an actual rendered-browser pass is still open.

## 9. Formatting / lint / typecheck / tests / build

- `npm run format:check` — pre-existing repo-wide CRLF/LF drift flagged ~65 files unrelated to this
  change (confirmed via `git status` — modified before this session started); the 5 files this
  session created/edited were formatted with `prettier --write` and now pass.
- `npm run lint` — clean.
- `npm run typecheck` — clean (contracts, sheet-schema, functions, web).
- `npm run build` — clean (functions + web + libs).
- `npm run test` (functions): **588/589 passed.** The one failure
  (`tests/media-api.test.ts` › "destroys the response ... when the Drive stream errors mid-transfer")
  is in `apps/functions/src/api/media.ts`, a file this session never touched; confirmed pre-existing
  in the already-modified working tree.
- `npm run test --workspace=apps/web`: **402/406 passed.** The 4 failures are all in
  `tests/reviewCorrections.test.tsx`'s "Church interior" candle-tray group — a test file this session
  never touched, from a separate in-flight "review corrections" workstream. Reproduces in isolation
  (not a resource-contention flake); the candle click-handler wiring itself
  (`toggleCandle`/`addCandle`/`removeCandle`, `CandleTray`'s `onClick`) was read and is unmodified and
  correctly wired. The file has no `localStorage.clear()` in `beforeEach`, and
  `candleRecovery.ts` persists pending-operation state to real `localStorage` keyed by user id — a
  plausible pre-existing test-isolation gap across that file's own tests, unrelated to Church audio.
  Flagging per CLAUDE.md §13 rather than fixing, since it belongs to a different in-flight workstream.
- Playwright e2e: none of `tests/e2e/*.spec.ts` reference Church/hymn/candle, so none were run for
  this change; a full e2e run was not attempted (out of scope, unrelated specs).

## 10. Changed/added files

**New:**
- `apps/functions/src/services/content-banks-v1-seed.service.ts`
- `apps/functions/src/services/church-audio-media-seed.service.ts`
- `scripts/seed-content-banks-v1.mjs`
- `scripts/seed-church-audio-media.mjs`
- `scripts/verify-content-banks-v1-live.mjs`
- `docs/reports/CONTENT_BANKS_V1_AND_CHURCH_AUDIO_EVIDENCE.md` (this file)

**Edited:**
- `apps/web/src/features/world/views/ChurchView.tsx` (hymn → Gospel reading)
- `apps/web/src/features/world/WorldExperience.tsx` (Church-exterior bell)
- `apps/web/src/features/world/placeComposition.ts` (removed the now-gone `church-hymns` anchor)
- `apps/functions/src/world/church.ts` (`gospelReadingAudioRef`)
- `packages/contracts/src/world.ts` (`ChurchStateResponse.gospelReadingAudioRef`)
- `package.json` (two new `seed:*` scripts)
- `docs/Veoullas_World_Living_Bible.md` (new `§18B-1` decision record)

## 11. Explicit confirmation

No later milestone/feature was implemented beyond what Ahmed asked for in this conversation: the
Gate, Map, buildings other than Church/Café-catalog-registration, birthday event, VAR/Gemini,
Marcelino behavior, and real Admin authentication were not touched. Ocean's actual video registration
was correctly left for Ahmed's files. No commit, push, or deployment was performed.

**Separately noted, not fixed (out of scope for this task):** `CLAUDE.md`'s "Quick reference: current
milestone" section (bottom of the file) still describes M01 as the latest accepted milestone and
warns against building the Gate/Map/buildings/characters — this is now visibly stale against the
actual working tree (Phase 1/2/3 checkpoints, Church, Café, Cottage, Farm, Museum, Admin panel, and
more already exist, uncommitted, from other sessions). Flagging per CLAUDE.md §13 rather than editing
someone else's in-flight documentation.
