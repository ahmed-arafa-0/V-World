# Content Completion v1 — Import Preview & Idempotent Seed

**Date:** 2026-09-22
**Source package:** `assets/Veoulla_Content_Completion_v1/` (`README_CODEX.md`, `README_AR.md`,
`MEDIA_HANDOFF.md`, `dialogue_5_locales.json`, `resolved_title_proposals.json`,
`church_starter_5_locales.json`, `ui_text_5_locales.json`, `quiz_import_preview_316_ar.json`,
`quiz_starter_6_5_locales.json`, `quiz_schedule_proposal.json`, `quiz_source_316_ar.json`,
`VALIDATION.json`, `MANIFEST.json`, `REVIEW.html`).
**Nature of this document:** a dry-run mapping, exact-cell preview, and idempotent seed —
**nothing has been written to the Sheet.**

## What was done

1. Read the package and its two source reports (`docs/content/REAL_CONTENT_GAPS.md`,
   `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md`, both dated 2026-09-22, already produced from a
   prior bounded live-Sheet inspection).
2. Ran `scripts/inspect-real-content-gaps.mjs` again — one fresh, bounded, batched, read-only
   `batchGet` across the same 19 named tabs — to resolve real row IDs, real column shapes, and real
   current cell values before writing any code. **No `update`/`append` call was made.**
3. Wrote four new pure, idempotent seed modules in `apps/functions/src/services/`:
   - `content-completion-v1-dialogue-seed.service.ts` (16 missing `15_DIALOGUE` groups)
   - `content-completion-v1-ui-text-seed.service.ts` (18 beat titles + 40 missing `08_UI_TEXT`
     labels + 3 missing `ui_map` locales)
   - `content-completion-v1-church-seed.service.ts` (church verse placeholder replacement + 3
     Bible stories)
   - `content-completion-v1-quiz-seed.service.ts` (the 316-question bank + 6-question starter set)

   Each follows the existing repo convention (`welcome-message-seed.service.ts`,
   `phase1-player-ui-text-seed.service.ts`, `phase2-config-seed.service.ts`): a pure `build*Rows()`
   function with no I/O, and a `seed*()`/`plan*`+`apply*` pair that uses
   `SheetGateway.appendRowsIfAbsent` (pure insert, never touches an existing primary key) or the
   same formula-aware exact-cell plan/apply pattern as the approved welcome-message seed (for the
   one cell-level *update*, the church verse). 16 new unit tests were added (1 file per service);
   the full existing suite (589 tests across 57 files) still passes, and `tsc --noEmit` and `eslint`
   are clean.
4. Wrote `scripts/preview-content-completion-v1.mjs` — a second read-only script that calls only
   the pure `build*Rows()` functions and diffs them against the live snapshot from step 2, entirely
   in memory. **It calls no gateway write method and no `seed*()` function.**
5. Confirmed, via that diff, that every proposed row is a clean insert (see counts below) — zero
   collisions with anything already live, zero in-batch duplicates.

**No code here has been executed against the live Sheet. No `enabled` cell was set to `TRUE` for
any newly proposed content. No `active_date` was assigned to anything that didn't already have
one.**

## Exact counts (verified, not estimated)

| Tab               | New rows proposed | Already live (skipped) | Notes                                             |
| ----------------- | -----------------: | ----------------------: | -------------------------------------------------- |
| `15_DIALOGUE`      | 80 (16 groups × 5) | 0                        | `dlg_gate`/`dlg_naming` untouched                   |
| `08_UI_TEXT`       | 293                | 0                        | 90 beat titles + 200 labels + 3 `ui_map` locale fill |
| `30_CHURCH_CONTENT`| 18                 | 0 (2 existing rows *updated*, not inserted) | 15 story rows + 3 verse locale-fill rows |
| `31_CHURCH_QUIZ`   | 340                | 0                        | 316 bank + 24 new-locale starter rows (6 shared Arabic rows deduped) |

All four seeds insert content with **`enabled: 'FALSE'`** (see §3 for why this also applies to
`08_UI_TEXT`, which I initially got wrong — see "Correction made while preparing this preview"
below). The quiz and dialogue rows are also **undated**. Nothing here can appear to a player by
itself.

### Correction made while preparing this preview

My first draft of the `08_UI_TEXT` seed used `enabled: 'TRUE'`, reasoning by analogy to the
already-approved `world_*`/`player_*` fallback-text seeds. Checking the actual runtime
(`content-runtime.service.ts`'s `computeContentRuntime` calls `readEnabledRowsBatch`, which filters
`08_UI_TEXT` to `enabled === true`; `world/cafe.ts`'s text resolver filters `enabled !== false`)
showed that's wrong here: unlike those pre-approved fallback mirrors, this wording is unreviewed,
and every one of the 40 labels + 18 beat titles attaches to an entity that is **already live**
(`11_LOCATIONS`, `21_KEYS`, `23_ACHIEVEMENTS`, 3 of 5 `32_ARCADE_GAMES`, `34_MUSEUM_EXHIBITS` are
all `enabled: TRUE` today). Inserting these as `enabled: TRUE` would have made real, currently-generic
UI text (e.g. "Location"/"Key"/"Achievement") change to this package's unreviewed wording the
moment the seed actually ran — i.e. it would have been "enabling content" in every way that
matters, despite not touching any `enabled` flag on the *entities themselves*. Fixed to
`enabled: 'FALSE'` before any of this was run.

## 1. Dialogue — 16 missing `15_DIALOGUE` groups

Full text for all 16 groups, all 5 locales, is in
`apps/functions/src/services/content-completion-v1-dialogue-seed.service.ts` (copied verbatim from
the package). Resolved against the real schema/live data:

- **`speaker_id`**: the package's `speaker_role_proposal` ("narrator"/"companion") is explicitly
  documented in the package's own README as semantic metadata, not a real ID. `36_CHARACTERS` (read
  live) has exactly one narrating/companion character, `var` — the two already-live groups
  (`dlg_gate`, `dlg_naming`) both use `speaker_id: 'var'`. Every new row uses `speaker_id: 'var'`
  too. `marcelino` exists as a character but never speaks first-person in this package (VAR
  describes him in `dlg_marcelino`, matching the live convention).
- **`display_mode`**: resolved from each beat's real `14_STORY_BEATS.beat_type` (read live), not
  from the package's speaker-role label (the two didn't line up 1:1 — e.g. `dlg_gate_open`'s beat
  is `beat_type: cinematic` but the package tagged it "companion"). Per CLAUDE.md §17 / the Living
  Bible, VAR's narration renders as cinematic text and direct dialogue as a speech bubble; the code
  (`DialogueText.tsx`) branches purely on `displayMode === 'speech_bubble'`. Only `beat_01_boot` and
  `beat_04_gate_open` are `beat_type: cinematic` → `displayMode: 'narration'`; the other 14 use
  `'speech_bubble'`, matching the existing live convention (`dlg_gate` is `beat_type: interaction`,
  `dlg_naming` is `beat_type: choice`, both already `speech_bubble`).
- **`dialogue_id`** = `<group_id>_01` (matches the live `dlg_gate` → `dlg_gate_01` convention).
  `dialogue_row_id` = `<dialogue_id>_<en|ar|it|el|fr>` (matches the live row-id shape exactly).
- No `voiceover_id` is assigned (CLAUDE.md §17: no voice-over, ever again).
- `dlg_church`'s placement note ("Church exterior, at the door, before entry. Companion must never
  render inside") matches what's already true in code: `placeComposition.ts` defines no `companion:`
  sprite for `church-interior`, confirming VAR is already kept outside. No code change needed or
  made.

**This needs no decision from you** — it's a clean insert, text is exactly as authored in the
package, disabled.

## 2. Beat titles + 40 UI-text labels (`08_UI_TEXT`)

All 18 beats' real `title_text_id` values (read live, confirmed against the package's
"unverified beat_id" warning):

| `beat_id` | `title_text_id` | `beat_id` | `title_text_id` |
|---|---|---|---|
| beat_01_boot | beat_boot_title | beat_10_arcade | beat_arcade_intro |
| beat_02_gate | beat_gate_title | beat_11_cottage | beat_cottage_intro |
| beat_03_var_reveal | beat_var_reveal | beat_12_marcelino | beat_marcelino |
| beat_04_gate_open | beat_gate_open | beat_13_message | beat_ahmed_message |
| beat_05_beach | beat_beach_intro | beat_14_farm | beat_farm_intro |
| beat_06_naming | beat_naming | beat_15_museum_approach | beat_museum_approach |
| beat_07_church | beat_church_intro | beat_16_hall | beat_hall_intro |
| beat_08_cafe | beat_cafe_intro | beat_17_map_unlock | beat_map_unlock |
| beat_09_walkman | beat_walkman | beat_18_complete | beat_freedom |

The 40 wholly-missing `text_id`s (locations ×8, subtitles ×3, key names ×7, achievement
title/desc ×8, `ui_language`/`ui_walkman`/`ui_back` ×3, crop names ×3, game names ×5, exhibit
names ×3) were confirmed absent by the live read — zero collision with any of the 867 existing
`08_UI_TEXT` rows. `ui_map` already has live `en`/`ar-EG` rows (`ui_map_en`/`ui_map_ar`,
`screen_id: global`, `component_id: map_button`) — **preserved exactly, never touched**; only the
missing `it`/`el`/`fr` rows are proposed, matching that same `screen_id`/`component_id`.

**Not included: the 4 `wing_titles`.** `resolved_title_proposals.json` also proposes display names
for `archive_wing`/`stories_wing`/`memories_wing`/`secret_wing`, but `34_MUSEUM_EXHIBITS` (the only
place `wing_id` lives) has **no display-name column for a wing at all** — only
`display_name_text_id` at the individual-exhibit level. This matches
`docs/content/REAL_CONTENT_GAPS.md` §9's own finding ("Wings themselves have no separate
display-name field in the schema"). Writing a `wing_*` text_id that nothing reads would be
inventing a feature, not filling a gap.

**Decision needed:** should a wing display-name column be added to `34_MUSEUM_EXHIBITS` (a schema
change — out of scope for this content-only pass and something I won't do without you asking for
it explicitly), or should the wing name be dropped / folded into something else? The 4 proposed
titles are sitting ready in `resolved_title_proposals.json` either way.

**Otherwise, no decision needed** — clean insert, disabled, see the correction note above for why.

## 3. Church verse (`church_verse_001`) — the one *update*, not insert

The live `en`/`ar-EG` rows (read 2026-09-22) are:

| Field | Live value (both rows) |
|---|---|
| `title` | "Birthday Verse" (en) / "آية عيد الميلاد" (ar) |
| `active_date` | **2026-09-26** |
| `review_status` | `pending_review` |
| `enabled` | `FALSE` |
| `text` | `<REVIEWED VERSE TEXT>` / `<نص الآية بعد المراجعة>` (placeholder) |
| `bible_reference` | `<REFERENCE>` (placeholder) |
| `source_url` | `<APPROVED_SOURCE_URL>` (placeholder) |

The package proposes replacing only the placeholder `text`/`bible_reference`/`source_url` with
Matthew 11:28 ("Come unto me, all ye that labour..."), leaving `title`/`active_date`/
`review_status`/`enabled` untouched — exactly matching its own instruction to "preserve existing
row IDs, metadata and schedule." `planChurchVerseReplacement()`/`applyChurchVerseReplacement()`
implement this as an exact-cell, conflict-checked update (same pattern as the already-approved
`welcome-message-seed.service.ts`): it refuses to run if any of those three cells hold different
nonblank authored text, or a formula. Checked against the live snapshot: **zero conflicts, a clean
2-cell-group update.** Separately, the missing `it`/`el`/`fr` locale rows for the same verse are
proposed as pure inserts, mirroring the live rows' own schedule/status/enabled state.

**Flagging, not deciding, for you:** the live row's **title is "Birthday Verse" and its
`active_date` is 2026-09-26** — 4 days from today. That's existing authored metadata I'm
preserving untouched (per the package's own instruction and per CLAUDE.md §14), but it's worth
your eyes: the package's proposed verse text (Matthew 11:28, a "come and rest" verse) doesn't
itself reference a birthday, and I have no way to confirm from code or schema alone whether
"Birthday Verse" / 2026-09-26 is deliberate framing tied to a real date that matters, a leftover
placeholder title, or something else. I did not reinterpret or change either cell.

## 4. Three Bible stories (`church_story_storm_001`/`sheep_001`/`samaritan_001`)

Brand-new `content_id`s, no existing row of any locale — 15 pure-insert rows (3 stories × 5
locales), `content_type: 'story'`, `active_date` left **blank** (the package proposes none —
assigning one is a scheduling decision, same category as the quiz's §5.1 below),
`review_status: 'pending_review'` (matches the only live precedent in this table), `enabled:
'FALSE'`. `image_asset_ids` is left **blank**: the package's own `asset_status: 'not_generated'`
confirms no art exists, and no `10_ASSETS` row exists for `church_story_*_001_image` either
(confirmed against the live read) — writing that ID now would be a dangling reference to an asset
that doesn't exist yet.

**Decision needed:** none to insert the text. When art is eventually generated and a real
`10_ASSETS` row exists for each image, a follow-up (not this seed) should set `image_asset_ids` and
pick an `active_date`.

## 5. Quiz bank (316 questions + 6-question starter)

`quiz_import_preview_316_ar.json` is already schema-mapped to `31_CHURCH_QUIZ`'s real columns
(confirmed field-by-field against the live template row `quiz_001_en`/`quiz_001_ar` and against
`docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md` §4). Its own `blocking_fields: ["active_date"]`
matches what this seed does: every one of the 316 rows, plus the 24 net-new starter-set locale
rows (`en`/`it`/`el`/`fr` for 6 of the 316 questions — the starter's 6 Arabic rows are
byte-identical duplicates of 6 bank rows, verified, so they're deduped rather than double-inserted),
is appended **undated and `enabled: 'FALSE'`**. `seedQuizBankRows()`/`buildQuizBankRows()` actively
**refuse** (throw) if any source row is already enabled or already carries an `active_date`, so this
can never accidentally schedule or activate anything.

`achievement_id`/`key_reward_type_id` (`ach_perfect_quiz`/`key_candle`) and
`review_status` (`pending_review`) are carried over unchanged from the package's own preview file,
which itself mirrors the live template row — no reward rule, quantity, cap, or achievement trigger
is touched.

**Decisions needed from you (named in `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md` §5, still
open — this seed does not resolve them, only stages the text for when you do):**

1. **§5.1 (blocking): scheduling.** How do 316 dateless questions become dated, `enabled: TRUE`
   rows? `quiz_schedule_proposal.json` proposes one fixed 50-day rotation (6/day: 1 MC + 1 TF at
   each of easy/medium/hard) starting from a day you choose using the real game clock — not this
   package's creation date. Nothing is scheduled until you pick a start day.
2. **§5.4: reward linkage.** Confirm reusing `ach_perfect_quiz`/`key_candle` for the whole bank (vs.
   varying by batch/difficulty) before activating any of it.
3. **§5.6: locale gap.** The bank is Arabic-only (bar the 6-question starter's extra 4 locales).
   Activating it means non-Arabic players silently see nothing from this pool until translated —
   confirm that's acceptable for however much of the bank you activate first.
4. If the starter set is ever used as a stand-alone multilingual review day before the 50-day
   rotation starts, explicitly decide whether those 6 questions repeat or are skipped when the
   rotation later reaches them (package's own note, unresolved).

## 6. Explicitly not attempted (named, not silently skipped)

- **Hymns (`20_SONGS`, `location_id=church`):** the content package contains no hymn text/audio to
  seed — `MEDIA_HANDOFF.md` states this is still an open choice for you (which hymn, whose
  recording). Nothing to import yet.
- **Café/birthday song titles, artist, cover art, ocean video, comic PDF, birthday-exhibit
  media, 7 ambient-audio rows, 6 scene-background asset IDs:** all named in
  `docs/content/REAL_CONTENT_GAPS.md`/`MEDIA_HANDOFF.md` as needing real Drive files or choices
  from you first. This package supplies no files for any of them (it says so itself: "0 generated
  images, 0 audio/video files"). Out of scope for a text-only import.
- **Museum wing titles:** see §2 — schema has no field for them.

## How to proceed once you've reviewed this

Nothing further happens automatically. Once you approve specific wording/dates:

- Dialogue, the 40+18 UI-text labels, and the 3 stories can be **inserted** (still `enabled:
  FALSE`) via each service's `seed*()` — a single `appendRowsIfAbsent` batch write each, safe to
  re-run (idempotent). Turning them on is a separate, later, per-row `enabled` flip.
- The church verse text replacement runs via `planChurchVerseReplacement`/
  `applyChurchVerseReplacement` — same conflict-checked pattern as the approved welcome-message
  seed, re-runnable with zero further writes once applied.
- The quiz bank inserts via `seedQuizBankRows` (still undated/disabled) whenever you're ready for
  the text to exist in the Sheet; scheduling/enabling specific dates is a separate action once
  §5.1/§5.4/§5.6 above are decided.

No commit, push, or deploy was made. No live write occurred. `docs/content/REAL_CONTENT_GAPS.md`
and `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md` remain the authoritative record of what open
decisions predate this document; this one only adds the concrete, schema-correct rows and confirms
they don't collide with anything live.
