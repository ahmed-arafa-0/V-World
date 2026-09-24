# Phase 2 — exact remaining artwork requirements

**Recorded:** 2026-09-20. Derived from the code and a single read-only batched read of the live Sheet (`10_ASSETS`, `09_ICONS`, `21_KEYS`, `28_FARM_CROPS`, `32_ARCADE_GAMES`, `23_ACHIEVEMENTS`, `11_LOCATIONS`; no writes, no Drive file IDs printed). Supersedes the art parts of `PHASE_2_HANDOFF.md` §1 where they differ (differences are called out in section 6).

**Inventory at this date:** `assets/` holds only the Phase 1 handoff (`assets/phase1`, 16 PNGs + icons + manifest). **No Phase 2 artwork has been downloaded to the project.** Nothing was registered, copied to a public folder or given a Drive ID.

Delivery convention (unchanged): one `10_ASSETS` row per asset, `asset_type = image`, `drive_file_id` = desktop file, `mobile_drive_file_id` = portrait file (scenes only), upload under the configured Drive asset root. Landscape 1672×941, portrait 941×1672. Character/sprite/icon assets are single files with transparent background. Registering a row is enough: the runtime swaps the temporary visual automatically and serves the portrait file to portrait screens.

## 1. Scene backgrounds — desktop + mobile pair each (consumer: `Stage`)

| Asset id (exact)         | Consumer (view → `data-testid`)        | Must leave reachable in **both** crops                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `junction_scene`         | `Junction.tsx` → `junction`            | Church road on the **left**, Café on the **right**, road ahead **centre**, path back (bottom). Physical geography; never mirrored for Arabic.                                                                                            |
| `church_interior_scene`  | `ChurchView.tsx` → `church-interior`   | 6+ candle positions (`candle-*`, `church_candle_slots`), verse, quiz, hymns, story stand, photo frame, leave                                                                                                                             |
| `cafe_exterior_scene`    | `Exterior.tsx` → `cafe-exterior`       | enter (centre), back (bottom-left), forward (bottom-right)                                                                                                                                                                               |
| `cafe_interior_scene`    | `CafeView.tsx` → `cafe-interior`       | gramophone, record wall, counter, Walkman hand-over, request, leave                                                                                                                                                                      |
| `arcade_exterior_scene`  | `Exterior.tsx` → `arcade-exterior`     | enter, back, forward                                                                                                                                                                                                                     |
| `arcade_interior_scene`  | `ArcadeView.tsx` → `arcade-interior`   | one row of **5** cabinets (`cabinet-1…5`; 3 enabled), scoreboard, leave                                                                                                                                                                  |
| `cottage_exterior_scene` | `Exterior.tsx` → `cottage-exterior`    | mailbox outside (`cottage-outside-mailbox`), door (`cottage-enter`), garden Marcelino emerges from, back, forward                                                                                                                        |
| `cottage_interior_scene` | `CottageView.tsx` → `cottage-interior` | **calendar/clock** (`cottage-countdown`, high & central), reading/memory corner, mailbox, **cat home** (`cottage-var-place`), **chick home** (`cottage-marcelino-place`), window (live time/weather), ≥4 decor slots (`decor_1…`), leave |
| `farm_exterior_scene`    | `FarmView.tsx` → `farm-exterior`       | ≥6 plots (`farm_plot_count`), Barn (exterior only), forward to the Everkeep road, back                                                                                                                                                   |
| `museum_exterior_scene`  | `MuseumView.tsx` → `museum-exterior`   | key sockets (one per required key), enter, back                                                                                                                                                                                          |
| `museum_hall_scene`      | `MuseumView.tsx` → `museum-hall`       | central artifact, progress map, wing doors                                                                                                                                                                                               |

Already registered and unchanged: `map_island_transparent`, `map_ocean_loop`, the Phase 1 Gate/Beach/Church-exterior scenes, `var_*`.

**Composition contract (implemented in `placeComposition.ts`):** hotspot anchors are % of the painted plane per desktop/mobile crop, clamped into the visible frame, so a tight crop cannot hide a control. The tables for `cottage-interior` and `cottage-exterior` are ready; **anchors are provisional and need recalibrating to the final paintings** (one table, no view changes). Other places keep their existing anchor percentages, now measured on the painted plane. Keep the calendar/clock, both home corners and the mailbox away from the outer ~12 % of each variant.

## 2. Character sprites — separate transparent PNGs, never baked into a scene

| Asset id                                                                         | Pose / use                                                                                                                                       | Consumer                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `marcelino_idle`                                                                 | Standing in the Cottage chick home when present                                                                                                  | `MarcelinoSprite` in `CottageView` (only while `marcelino.visible`) |
| `marcelino_mailbag`                                                              | Arriving with the mailbag at the first delivery                                                                                                  | `MarcelinoSprite` in `CottageExterior` (first-delivery step)        |
| `marcelino_run_away`                                                             | Running off after handing over the message                                                                                                       | `MarcelinoSprite` in `CottageExterior`                              |
| `marcelino_sleeping`                                                             | Listed by the Bible; **no consumer exists** (the Farm still shows the 🐥 emoji, `FarmView.tsx` L105). Decide where it is used before drawing it. | none yet                                                            |
| `var_idle_collar`, `var_idle_no_collar`, `var_walk_collar`, `var_jump_no_collar` | **Already registered**; the cat's home in the Cottage reuses `var_idle_collar`.                                                                  | `Companion`                                                         |

Marcelino: small yellow chick, mailbag as signature accessory, remains small. Until his rows exist the 🐥 stand-in shows (`data-standin="true"`).

## 3. Key designs (`09_ICONS` → `10_ASSETS`, consumer: HUD key chip + toasts)

All seven rows **are already registered and enabled** in the live Sheet with a Drive file (`asset_type = svg`). Whether those files are final art is Ahmed's call; replace by uploading over the same asset ids.

| `key_type_id`   | `icon_id`            | `asset_id`                 | Shape (`21_KEYS.shape`) | Location |
| --------------- | -------------------- | -------------------------- | ----------------------- | -------- |
| `key_shell`     | `key_shell_icon`     | `asset_key_shell_icon`     | shell                   | beach    |
| `key_candle`    | `key_candle_icon`    | `asset_key_candle_icon`    | candle                  | church   |
| `key_music`     | `key_music_icon`     | `asset_key_music_icon`     | music_note              | cafe     |
| `key_token`     | `key_token_icon`     | `asset_key_token_icon`     | retro_token             | arcade   |
| `key_letter`    | `key_letter_icon`    | `asset_key_letter_icon`    | letter_envelope         | cottage  |
| `key_sunflower` | `key_sunflower_icon` | `asset_key_sunflower_icon` | sunflower               | farm     |
| `key_everkeep`  | `key_everkeep_icon`  | `asset_key_everkeep_icon`  | ancient_golden          | museum   |

## 4. Crops (Sunberry Fields)

Crop types (`28_FARM_CROPS`, all enabled): `sunflower` (common), `mango` (uncommon), `blueberry` (common).

**Literal growth-state names in the code** (`FarmPlotState`, `packages/contracts/src/world.ts`; computed in `apps/functions/src/world/farm.ts`): `empty`, `planted`, `growing`, `ready`, `wilted`.

- `empty` — no crop (plot art only, no crop sprite).
- `planted` — seeded but not yet watered **or** overdue for water (`needsWater = true`); this is the "seed/sprout" look.
- `growing` — watered and progressing (`progressPercent` 1–99).
- `ready` — harvestable.
- `wilted` — missed the wilt deadline; recoverable by watering, never killed.

Handoff §1 called the stages "seed, sprout, growing, ready, wilted": **those are not the code's names**. Art must map to the five above (1 sprite per crop × `planted`/`growing`/`ready`/`wilted` = 12 crop-stage sprites, plus one shared empty-plot graphic). No consumer draws them yet: `FarmView` shows a hard-coded emoji per crop (`CROP_GLYPH`) and a text state. The Sheet already names hooks `seed_icon_id` and `crop_icon_id` per crop (`seed_sunflower_icon`, `crop_sunflower_icon`, `seed_mango_icon`, `crop_mango_icon`, `seed_blueberry_icon`, `crop_blueberry_icon`); **none of those six ids has a `09_ICONS` or `10_ASSETS` row**. Per-state art has no Sheet column at all. **Decision for Ahmed** (not invented here): draw 12 stage sprites + 6 seed/crop icons, and I add a Sheet-driven per-state id convention when they exist.

## 5. Other art the code renders as a stand-in (no asset id exists yet — none was invented)

| Visual                                            | Consumer / stand-in today                                                                                                                     | Sheet handle today                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Arcade cabinets (5)                               | `ArcadeView` `cabinet-1…5`, blank frames                                                                                                      | `32_ARCADE_GAMES`: `game_memory`(1), `game_catch`(2), `game_puzzle`(3), `game_maze`(4, disabled), `game_trivia`(5, disabled) |
| Memory-card faces/back, catch items, puzzle photo | `games.tsx` emoji symbols / coloured tiles                                                                                                    | none                                                                                                                         |
| Candle lit/unlit                                  | `ChurchView` `candle-*` hotspot glow                                                                                                          | none                                                                                                                         |
| Decoration items (sunflower, mango, blueberry)    | Cottage decor shelf labels                                                                                                                    | crop ids                                                                                                                     |
| Museum artifact                                   | `MuseumView` `museum-artifact` (CSS orb)                                                                                                      | none                                                                                                                         |
| Map avatar idle/walking, location mist and vines  | `MapView` `map-avatar` `data-state="idle"\|"walking"`, `mist-<locationId>`, 🌿                                                                | none                                                                                                                         |
| Achievement icons                                 | `23_ACHIEVEMENTS.icon_id` is `<ACH_ICON>` for `ach_first_step`, `ach_perfect_quiz`, `ach_first_harvest`; `<SECRET_ICON>` for `ach_secret_001` | those four rows                                                                                                              |

These need Ahmed's decision on ids/rows before drawing (the code has no convention to follow). Walkman: there is no Walkman art consumer — it is a text/▶ control (`WalkmanBar`); `asset_icon_walkman` exists as a `ui` icon only.

## 6. Corrections to earlier notes

- Key icons **are** registered with Drive files (handoff §1 said they had none).
- Live `10_ASSETS` has **no** row for any Phase 2 scene or Marcelino id, and none for `audio_church_ambient … audio_museum_ambient` even though `11_LOCATIONS.ambient_asset_id` names them. Audio is out of scope here.
- Growth states are `empty/planted/growing/ready/wilted` (section 4).
- "Nails corner": the Living Bible only says nail polish is **decorative, not a gameplay interaction** (§18F). The code has no nails element, hotspot or asset id, so nothing was built or reserved for it; if the art includes a nails corner it needs no code unless it becomes interactive. Confirm what is meant.
