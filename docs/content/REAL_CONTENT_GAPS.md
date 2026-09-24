# Real Content Gaps — Inventory

**Date:** 2026-09-22
**Author:** Prepared by Claude Code for Ahmed Arafa, from static code/schema analysis plus one bounded, batched, read-only live-Sheet inspection.
**Nature of this document:** inventory only. No content was invented, no IDs were assigned, no reward/difficulty/date decisions were made, no live writes occurred, nothing was reset, committed, pushed, or deployed.

## Method

1. **Static analysis** of `packages/sheet-schema/src/tabs/*.ts` (the 42-tab registry) cross-referenced against every consumer in `apps/functions/src/world/*.ts`, `apps/web/src/features/world/**`, and `packages/contracts/src/world*.ts`.
2. **One bounded, batched, read-only live Sheet inspection**: a single Google Sheets `batchGet` call (via `SheetGateway.getRawTabsBatch`, the same mechanism the app itself uses to avoid per-tab quota pressure) across 19 named tabs relevant to player-facing content:
   `07_LANGUAGES, 08_UI_TEXT, 09_ICONS, 10_ASSETS, 11_LOCATIONS, 12_SCENES, 14_STORY_BEATS, 15_DIALOGUE, 19_MESSAGES, 20_SONGS, 21_KEYS, 22_KEY_RULES, 23_ACHIEVEMENTS, 30_CHURCH_CONTENT, 31_CHURCH_QUIZ, 32_ARCADE_GAMES, 34_MUSEUM_EXHIBITS, 36_CHARACTERS, 39_VALIDATION_LISTS`.
   The script is `scripts/inspect-real-content-gaps.mjs` (kept in the repo for re-use; it only calls `getRawTabsBatch(..., { bypass: true })` — no `update`/`append`/`write` call appears anywhere in it). Its raw dump was written to a scratch file outside the repo and used only to write this report.
3. `16_VOICEOVER` was intentionally **not** read — per the 2026-09-17 voice-over removal decision (CLAUDE.md §17), the backend no longer reads or exposes it, so it is out of scope for a player-facing content audit. `02_USERS, 03_SECRETS_DEV, 04_ADMIN_FLAGS, 05_ENTRY_LOGS, 06_SESSIONS, 17_EVENTS, 18_EVENT_PHASES, 24–29_PLAYER_*, 33_PLAYER_SCORES, 35_PLAYER_EXHIBITS, 37_CHARACTER_STATE, 38_DATA_DICTIONARY, 40/41_VAR_*` were not read: they hold config/operational/per-player state, not authored player-facing content, and reading them would have widened the "bounded" inspection without adding to this inventory.

## How to read this report

- **Missing** — no row, asset, or text exists at all for something the code references by ID.
- **Placeholder** — a row exists in the right shape, but its content is a literal template token (e.g. `<A>`, `<REFERENCE>`, `<DRIVE_FILE_ID_...>`).
- **Disabled** — `enabled = FALSE`; a deliberate off-switch, not necessarily "missing" content.
- **Progression blocker** — affects whether the first journey or a core daily loop can be completed at all.
- **Optional** — enriches the experience; nothing mechanically depends on it.

Every ID below is exactly what is in the live Sheet or the code today — nothing here is proposed or invented.

## Summary

| Content family                                                                   | Real, enabled content today                                                       | State                                                                                                                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-journey dialogue (`15_DIALOGUE`)                                           | 2 of 18 beats (`dlg_gate`, `dlg_naming`), 5/5 languages each                      | 16 of 18 beat dialogue groups have **zero rows**                                                                                                                     |
| Church verse (`30_CHURCH_CONTENT`, `content_type=verse`)                         | 0                                                                                 | 1 placeholder pair (en/ar-EG), disabled                                                                                                                              |
| Church story / story gallery (`content_type=story`)                              | 0                                                                                 | **No rows exist at all**, not even placeholders                                                                                                                      |
| Church photo-of-the-day (`content_type=photo`)                                   | 0                                                                                 | **No rows exist at all**, not even placeholders                                                                                                                      |
| Church quiz (`31_CHURCH_QUIZ`)                                                   | 0                                                                                 | 1 placeholder question pair, disabled — vs. a reviewed 316-question Arabic bank sitting in `assets/Veoulla_Quiz_Bank/` (see the companion quiz-integration preview)  |
| Church hymns (`20_SONGS`, `location_id=church`)                                  | 0                                                                                 | **No rows exist at all**                                                                                                                                             |
| Café songs / Walkman playlist (`20_SONGS`, `location_id=cafe`)                   | 3 rows, `enabled=TRUE`                                                            | All 3 have placeholder title/artist/cover; the welcome song's and both birthday songs' audio assets are `enabled=FALSE`                                              |
| Ambience (`11_LOCATIONS.ambient_asset_id` → `10_ASSETS`)                         | 2 of 9 locations (gate, beach)                                                    | 7 referenced ambient audio asset IDs (church/cafe/arcade/cottage/farm/museum/map) **do not exist** in `10_ASSETS` at all                                             |
| Ocean video                                                                      | `map_ocean_loop` (top-down, Map screen) fully registered with real Drive file IDs | The eye-level "Look at the ocean" video (`OceanView.tsx`'s `beach_ocean_eye_level_loop`) **does not exist as an asset ID anywhere in the Sheet**                     |
| Arcade game names (`32_ARCADE_GAMES.display_name_text_id`)                       | 0 of 5                                                                            | All 5 text IDs are **missing** from `08_UI_TEXT`                                                                                                                     |
| Museum wings/exhibits (`34_MUSEUM_EXHIBITS`)                                     | 4 exhibit rows exist, structurally complete                                       | 3 of 4 display-name text IDs missing; the comic PDF + its cover, the archive-portal source, and the birthday exhibit's images/audio are all unregistered/placeholder |
| Foundational UI text (locations, keys, achievements, icon alt text, beat titles) | Generic code-side fallback text always renders (never a blank screen)             | 60+ Sheet-specific text IDs referenced by ID from other tabs have **no row** in `08_UI_TEXT`                                                                         |

---

## 1. Dialogue (`15_DIALOGUE`) — progression-adjacent, largest gap

Schema: `packages/sheet-schema/src/tabs/world-structure.ts:103-130`. Consumed by `apps/functions/src/world/journey.ts` (beat metadata) and rendered as speech bubbles (`display_mode`) or cinematic text per CLAUDE.md §17.

The live Sheet has real, fully 5-language dialogue for exactly **2** of the first journey's 18 beats:

| `group_id`   | Beat(s)          | Locales present       |
| ------------ | ---------------- | --------------------- |
| `dlg_gate`   | `beat_02_gate`   | en, ar-EG, it, el, fr |
| `dlg_naming` | `beat_06_naming` | en, ar-EG, it, el, fr |

The other **16 beats' `dialogue_group_id` values have zero rows** in `15_DIALOGUE`:

| Beat ID                   | `beat_type`    | Location | Missing `dialogue_group_id` |
| ------------------------- | -------------- | -------- | --------------------------- |
| `beat_01_boot`            | cinematic      | gate     | `dlg_boot`                  |
| `beat_03_var_reveal`      | dialogue       | gate     | `dlg_var_reveal`            |
| `beat_04_gate_open`       | cinematic      | gate     | `dlg_gate_open`             |
| `beat_05_beach`           | location_intro | beach    | `dlg_beach`                 |
| `beat_07_church`          | location_intro | church   | `dlg_church`                |
| `beat_08_cafe`            | location_intro | cafe     | `dlg_cafe`                  |
| `beat_09_walkman`         | unlock         | cafe     | `dlg_walkman`               |
| `beat_10_arcade`          | location_intro | arcade   | `dlg_arcade`                |
| `beat_11_cottage`         | location_intro | cottage  | `dlg_cottage`               |
| `beat_12_marcelino`       | delivery       | cottage  | `dlg_marcelino`             |
| `beat_13_message`         | message        | cottage  | `dlg_first_message`         |
| `beat_14_farm`            | location_intro | farm     | `dlg_farm`                  |
| `beat_15_museum_approach` | unlock         | museum   | `dlg_museum`                |
| `beat_16_hall`            | location_intro | museum   | `dlg_hall`                  |
| `beat_17_map_unlock`      | unlock         | museum   | `dlg_map_unlock`            |
| `beat_18_complete`        | completion     | map      | `dlg_freedom`               |

**Blocker vs. optional:** progression through `journey.ts` is gated by each beat's `required_interaction_id` (e.g. `gate_dials`, `beach_signature`, `farm_first_interaction`), **not** by the presence of dialogue rows — so a player can mechanically complete the first journey today with these 16 beats narratively silent. This is not a hard blocker to advancing, but it means ~89% of the first journey currently has no story text at all. Recommend treating as a high-priority content gap even though it is not a hard blocker.

All 18 beats' `title_text_id` values (`beat_boot_title` … `beat_freedom`) are also missing from `08_UI_TEXT` (see §8).

**Authoring constraint for `dlg_church` (`beat_07_church`):** the companion (VAR) has no sprite placement for the `church-interior` scene in `apps/web/src/features/world/placeComposition.ts:107` — unlike every other interior/exterior place, which all define a `companion:` sprite — confirming the app already keeps VAR outside the Church. Per Ahmed's direction, any dialogue about _entering_ the Church belongs at the Church door (the approach/threshold beat), with VAR remaining outside; it should not be written as VAR accompanying Veoulla inside.

## 2. Church verse / story / photo (`30_CHURCH_CONTENT`)

Schema: `content-systems.ts:154-179`. Consumed by `apps/functions/src/world/church.ts` (`getChurchState` → `verse`/`story`/`photo`/`gallery`).

Live rows: exactly 2, both `content_id=church_verse_001` (en/ar-EG), `content_type=verse`, `enabled=FALSE`, `review_status=pending_review`. Placeholder cells: `text`, `bible_reference`, `source_url`.

| Content type                          | Consuming UI                                    | Rows in Sheet                                                          |
| ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `verse` (Verse of the day)            | Church → "Verse of the day" panel               | 1 placeholder pair, disabled                                           |
| `story` (Bible story / story gallery) | Church → "Bible story" / "Story gallery" panels | **0 rows — nothing to disable, nothing placeholder; genuinely absent** |
| `photo` (Photo and its story)         | Church → "Photo and story" panel                | **0 rows — genuinely absent**                                          |

Optional (no progression beat depends on Church daily content).

## 3. Church quiz (`31_CHURCH_QUIZ`)

Full comparison against `assets/Veoulla_Quiz_Bank/` is in the companion document `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md`. In short: the live tab has exactly one placeholder question pair (`quiz_001_en`/`quiz_001_ar`), `enabled=FALSE`, every text cell a literal placeholder token — there is **no real quiz content live**, and nothing to collide with importing the reviewed bank. Optional (quiz completion only affects a bonus key/achievement, not the first journey).

## 4. Hymns (`20_SONGS`, `location_id=church`)

Consumed by `church.ts` (`hymns` array, "Hymns" panel). **Zero rows** with `location_id=church` exist in `20_SONGS` — not placeholder, genuinely absent. Optional.

## 5. Café songs / Walkman playlist (`20_SONGS`, `location_id=cafe`)

| `song_id`          | Fields still placeholder            | Audio asset                    | Asset `enabled` |
| ------------------ | ----------------------------------- | ------------------------------ | --------------- |
| `song_welcome_001` | `title`, `artist`, `cover_asset_id` | `asset_audio_song_welcome_001` | **FALSE**       |
| `song_bday_001`    | `title`, `artist`, `cover_asset_id` | `asset_audio_song_bday_001`    | **FALSE**       |
| `song_bday_002`    | `title`, `artist`, `cover_asset_id` | `asset_audio_song_bday_002`    | **FALSE**       |

All three song rows themselves are `enabled=TRUE`, `available_in_walkman=TRUE`, but their backing audio asset rows in `10_ASSETS` are disabled and their `drive_file_id` cells are placeholder tokens (`<DRIVE_FILE_ID_SONG_WELCOME_001>`, etc.), and `explanation_text_id` values (`song_welcome_explanation`, `song_bday_explanation_1`, `song_bday_explanation_2`) have no row in `08_UI_TEXT` (§8). `song_bday_001`/`song_bday_002` also share `release_at=46291` (a birthday-event date), consistent with `18_EVENT_PHASES` not being in scope here. Optional for the first journey; the "welcome song" is reachable at the Café location-intro beat but not gated by `required_interaction_id`.

## 6. Ambience (`11_LOCATIONS.ambient_asset_id` → `10_ASSETS`)

| Location                                            | `ambient_asset_id`      | Exists in `10_ASSETS`?            |
| --------------------------------------------------- | ----------------------- | --------------------------------- |
| gate                                                | `audio_gate_ambient`    | Yes (placeholder `drive_file_id`) |
| beach                                               | `audio_beach_ambient`   | Yes (placeholder `drive_file_id`) |
| church                                              | `audio_church_ambient`  | **No row at all**                 |
| cafe                                                | `audio_cafe_ambient`    | **No row at all**                 |
| arcade                                              | `audio_arcade_ambient`  | **No row at all**                 |
| cottage                                             | `audio_cottage_ambient` | **No row at all**                 |
| farm                                                | `audio_farm_ambient`    | **No row at all**                 |
| museum                                              | `audio_museum_ambient`  | **No row at all**                 |
| map (`scene_map`, via `12_SCENES.ambient_audio_id`) | `audio_map_ambient`     | **No row at all**                 |

Only gate and beach have any ambient asset row to begin with (and even those two are placeholder Drive IDs, not real files). The other 7 referenced ambient IDs are dangling references — not disabled, not placeholder rows, simply never registered. Optional (ambience degrades gracefully to silence, per existing Ambience.tsx handling of a missing media ref), but a real, distinct gap from "just needs a Drive upload."

## 7. Ocean video

Two unrelated things share the word "ocean":

1. **`map_ocean_loop`** (`10_ASSETS`, `location_id=map`) — the top-down ocean loop behind the Map screen. **Fully registered**: real `drive_file_id` (`1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo`) and `poster_drive_file_id` (`1de1aBHsIG3PEso7WMALHKIaAVPNberMt`), `enabled=TRUE`. Not a gap — already usable.
2. **The eye-level "Look at the ocean" video** at the Beach, implemented in `apps/web/src/features/world/OceanView.tsx:6`, looks up asset ID **`beach_ocean_eye_level_loop`** by exact string match against `env.assets`. **No asset row with that ID exists anywhere in `10_ASSETS`.** The nearest candidate, `asset_ocean_loop` (`video`, `location_id=beach`, used as `scene_beach_arrival`'s _scene background_, not the eye-level interactive video), has placeholder `drive_file_id`/`mobile_drive_file_id`/`poster_drive_file_id` values and is a different logical asset per the code's own comment distinguishing it from the eye-level loop. **Net effect: the "Look at the ocean" feature will always show its `ocean_unavailable` fallback text — there is no ID under which the right asset could currently be found**, independent of whether a video file is ever uploaded. This needs either a new `10_ASSETS` row keyed `beach_ocean_eye_level_loop`, or a deliberate rename in code to point at whichever asset ID Ahmed intends — flagging rather than choosing.

## 8. Arcade game names (`32_ARCADE_GAMES.display_name_text_id`)

| `game_id`     | `display_name_text_id` | Cabinet | `enabled`             | Text row in `08_UI_TEXT`? |
| ------------- | ---------------------- | ------- | --------------------- | ------------------------- |
| `game_memory` | `game_memory_name`     | 1       | TRUE                  | **Missing**               |
| `game_catch`  | `game_catch_name`      | 2       | TRUE                  | **Missing**               |
| `game_puzzle` | `game_puzzle_name`     | 3       | TRUE                  | **Missing**               |
| `game_maze`   | `game_maze_name`       | 4       | FALSE ("Added later") | **Missing**               |
| `game_trivia` | `game_trivia_name`     | 5       | FALSE ("Added later") | **Missing**               |

The frontend already has a generic fallback (`arcade_game_untitled` → "Game"/"لعبة"/…), so cabinets render without crashing, just with a generic label instead of a real game name. `game_maze` and `game_trivia` being disabled is an intentional off-switch ("Added later" note), not a content gap by itself — but their names would still be needed whenever they're turned on.

## 9. Museum wings & exhibits (`34_MUSEUM_EXHIBITS`)

| `exhibit_id`            | `wing_id`       | `display_name_text_id`                           | Text row exists? | Media                                                                                                     |
| ----------------------- | --------------- | ------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `exhibit_old_site`      | `archive_wing`  | `exhibit_old_site_name`                          | **Missing**      | `source_content_id=previous_birthday_site` — **not registered in `10_ASSETS`**                            |
| `exhibit_comic_2025`    | `stories_wing`  | `exhibit_comic_name`                             | **Missing**      | `source_content_id=comic_pdf_2025`, `image_asset_ids=comic_cover` — **neither registered in `10_ASSETS`** |
| `exhibit_birthday_2026` | `memories_wing` | `exhibit_bday_name`                              | **Missing**      | `image_asset_ids=<IMAGE_IDS>`, `audio_asset_id=<AUDIO_ID>` — literal placeholders                         |
| `exhibit_secret_001`    | `secret_wing`   | _(intentionally blank — secret slot; not a gap)_ | n/a              | n/a                                                                                                       |

All 4 exhibit rows are `enabled=TRUE` and structurally complete (unlock rules, positions). Wings themselves have no separate display-name field in the schema (only `museum_wing_untitled`/"Wing" generic fallback exists) — that is a schema fact, not a missing-content item. Optional (Museum content gates on story-progress/achievement/key rules already in place, not on these text/media items).

## 10. Foundational UI text referenced by ID but absent from `08_UI_TEXT`

`08_UI_TEXT` has 867 rows covering 174 distinct `text_id`s, effectively all of them the `world_*`/`ui_*`/`player_*` control labels mirrored from the code-side fallback catalog (`packages/contracts/src/world-ui-text.ts`) — that catalog's own comment states these are "control/label strings only, never narration/dialogue/religious text/song or message content," so their being code-defaulted is by design, not a gap. Only **`ui_map`** is incomplete (en, ar-EG present; it/el/fr missing).

Separately, the following Sheet-authored, content-specific text IDs are referenced by other tabs' *_text_id columns but have **no row at all** in `08_UI_TEXT` (the frontend still renders — using its own generic fallback strings like "Game"/"Exhibit"/"Wing" — but the specific names below are simply not authored anywhere):

- **Locations** (`11_LOCATIONS`): `location_gate`, `location_beach`, `location_church`, `location_cafe`, `location_arcade`, `location_cottage`, `location_farm`, `location_museum` (all 8 display names), plus subtitles `subtitle_beach`, `subtitle_farm`, `subtitle_museum`.
- **Keys** (`21_KEYS`): `key_shell_name`, `key_candle_name`, `key_music_name`, `key_token_name`, `key_letter_name`, `key_sunflower_name`, `key_everkeep_name` (all 7).
- **Achievements** (`23_ACHIEVEMENTS`): `ach_first_step_title`/`ach_first_step_desc`, `ach_quiz_perfect_title`/`ach_quiz_perfect_desc`, `ach_first_harvest_title`/`ach_first_harvest_desc`, `ach_secret_001_title`/`ach_secret_001_desc` (all 8).
- **Icon alt text** (`09_ICONS`): `ui_language`, `ui_walkman`, `ui_back`, plus the 7 key names and 3 crop names above reused as `alt_text_id` (farm seed/crop icons: `crop_sunflower_name`, `crop_mango_name`, `crop_blueberry_name`).
- **Story beat titles** (`14_STORY_BEATS`): all 18, `beat_boot_title` … `beat_freedom`.

None of these block progression (the app never crashes or hard-locks on missing UI text; it falls back to a generic label), but they mean every location name, key name, achievement title, and beat title a player currently sees is the generic code-side fallback, never Sheet-authored content.

## 11. Controlled-list values relevant to any future import

Read live from `39_VALIDATION_LISTS` (single source of truth per CLAUDE.md §4):

- `review_status`: `draft`, `pending_review`, `approved`, `rejected` — **note:** `assets/Veoulla_Quiz_Bank`'s package-level `status` field uses the string `draft_for_review`, which is **not** one of these four values (see the companion quiz-integration preview for the resulting decision needed).
- `locale`: `en`, `ar-EG`, `it`, `el`, `fr` — matches `07_LANGUAGES` and the quiz bank's `ar-EG`.

## Assets already registered (do not recreate or re-upload)

To avoid duplicate uploads, everything below already has a row in `10_ASSETS` (whether or not its `drive_file_id` is itself still a placeholder — the _registration_, i.e. the asset_id/type/location/scene wiring, already exists and should be edited in place, not recreated):

`asset_gate_bg`, `asset_ocean_loop`, `asset_world_logo`, `asset_map`, `audio_gate_ambient`, `audio_beach_ambient`, `asset_icon_map`, `asset_icon_language`, `asset_icon_walkman`, `asset_icon_back`, `asset_key_*_icon` (7), `asset_vo_gate_01_*` (5 locales), `asset_vo_bday_greeting_*` (5 locales), `asset_audio_song_welcome_001`, `asset_audio_song_bday_001`, `asset_audio_song_bday_002`, `map_island_transparent`, `map_ocean_loop` (fully live, real Drive IDs), `gate_closed_bg`, `gate_ajar_static_bg`, `beach_focus_scene`, `beach_three_steps_scene`, `steps_church_approach_scene`, `church_focus_scene`, `var_idle_no_collar`, `var_idle_collar`, `var_walk_collar`, `var_jump_no_collar`, `asset_icon_walk_forward/back`, `asset_icon_look_left/right`, `asset_icon_interact`, `asset_icon_settings`, `junction_scene`, `church_interior_scene`, `cafe_exterior_scene`, `cafe_interior_scene`, `arcade_exterior_scene`, `arcade_interior_scene`, `cottage_exterior_scene`, `cottage_interior_scene`, `farm_exterior_scene`, `museum_exterior_scene`, `museum_hall_scene`, `marcelino_idle`, `marcelino_mailbag`, `marcelino_run_away`, `walkman_player`, `candle_unlit`, `candle_lit`, `museum_artifact`, `crop_*_ready/growing/planted/wilted` (3 crops × 4 states), `map_avatar_idle/walking/arrival`, `asset_seed_*_icon`/`asset_crop_*_icon` (3 crops), `asset_achievement_*` (4).

**Not yet registered anywhere** (genuinely need a new `10_ASSETS` row, not just a Drive upload against an existing one): `beach_ocean_eye_level_loop` (see §7), `previous_birthday_site`, `comic_pdf_2025`, `comic_cover` (see §9), the church/cafe/arcade/cottage/farm/museum/map ambient audio IDs (see §6), and the 6 scene background asset IDs still written as literal placeholders in `12_SCENES` (`<CHURCH_ASSET>`, `<CAFE_ASSET>`, `<ARCADE_ASSET>`, `<COTTAGE_ASSET>`, `<FARM_ASSET>`, `<MUSEUM_ASSET>`, `<HALL_ASSET>` — 7 tokens, one of which, `<HALL_ASSET>`, is for `scene_museum_hall` in addition to `scene_museum_approach`).

## Known limitations of this inventory

- This is a snapshot from one read at 2026-09-22; the Sheet is admin-editable and may already have changed.
- `39_VALIDATION_LISTS` was read for `review_status` and `locale` only; other controlled lists were read but not all are analyzed above (only the two relevant to the companion quiz preview).
- Event-phase content (`17_EVENTS`, `18_EVENT_PHASES`) was out of scope by design (CLAUDE.md — the birthday event is not yet in build scope).
- No attempt was made to verify whether any placeholder Drive file ID actually resolves (Drive was not queried) — this is a Sheet-content inventory, not a Drive-media audit.
