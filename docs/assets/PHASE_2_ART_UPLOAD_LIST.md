# Phase 2 art — files Ahmed must upload to Drive

**Generated 2026-09-20** from `assets/veoulla-art-pack/asset_manifest.json`. Upload each file to the configured Drive asset root **with exactly this filename** (the exact-name discovery used by the Phase 1 seeds needs that). Nothing here has been uploaded, registered or written to the Sheet.

- **Scenes** are the original pack PNGs (`assets/veoulla-art-pack/phase2/scenes/{desktop,mobile}`), unchanged.
- **Everything else** is a _web derivative_ built by `npm run art:derivatives` into `assets/veoulla-art-web/` (transparent sprites trimmed to one shared box per family so every pose/state keeps the same scale and ground line; icons downscaled). The composition tables are calibrated against these derivatives, so upload the derivatives, not the 1254x1254 originals. The originals stay in the pack.
- **No re-upload** of the 16 Phase 1 files or `map_island_transparent` (existing registrations, same bytes).
- **Art fixes v2 (2026-09-20)** replace four earlier pending entries: `museum_hall_scene_{desktop,mobile}_v2.png` (two painted wing doors) and `crop_{mango,blueberry}_wilted_v2.png` (clearly wilted). The `_v2` suffix is an art revision, not a Sheet version: these are first uploads, so register them as `version` 1 like the rest. The v1 files of these four were never uploaded and must not be. The blueberry stage derivatives were rebuilt on a slightly taller shared crop box, so upload all four current blueberry files from the folder below (not any earlier build).
- **Ready-to-upload folder:** `assets/veoulla-art-upload-ready/` holds exactly these 61 files, flat, under the exact filenames (gitignored with the rest of `assets/`).
- Not needed: the 12 optional closeups, `farm_plot_empty`, `marcelino_walk` (no consumer).

**61 files.**

## Scenes (22)

| Filename                                | Asset id                 | Variant | Source   |
| --------------------------------------- | ------------------------ | ------- | -------- |
| `junction_scene_desktop_v1.png`         | `junction_scene`         | primary | original |
| `junction_scene_mobile_v1.png`          | `junction_scene`         | mobile  | original |
| `church_interior_scene_desktop_v1.png`  | `church_interior_scene`  | primary | original |
| `church_interior_scene_mobile_v1.png`   | `church_interior_scene`  | mobile  | original |
| `cafe_exterior_scene_desktop_v1.png`    | `cafe_exterior_scene`    | primary | original |
| `cafe_exterior_scene_mobile_v1.png`     | `cafe_exterior_scene`    | mobile  | original |
| `cafe_interior_scene_desktop_v1.png`    | `cafe_interior_scene`    | primary | original |
| `cafe_interior_scene_mobile_v1.png`     | `cafe_interior_scene`    | mobile  | original |
| `arcade_exterior_scene_desktop_v1.png`  | `arcade_exterior_scene`  | primary | original |
| `arcade_exterior_scene_mobile_v1.png`   | `arcade_exterior_scene`  | mobile  | original |
| `arcade_interior_scene_desktop_v2.png`  | `arcade_interior_scene`  | primary | original |
| `arcade_interior_scene_mobile_v2.png`   | `arcade_interior_scene`  | mobile  | original |
| `cottage_exterior_scene_desktop_v1.png` | `cottage_exterior_scene` | primary | original |
| `cottage_exterior_scene_mobile_v1.png`  | `cottage_exterior_scene` | mobile  | original |
| `cottage_interior_scene_desktop_v2.png` | `cottage_interior_scene` | primary | original |
| `cottage_interior_scene_mobile_v2.png`  | `cottage_interior_scene` | mobile  | original |
| `farm_exterior_scene_desktop_v1.png`    | `farm_exterior_scene`    | primary | original |
| `farm_exterior_scene_mobile_v1.png`     | `farm_exterior_scene`    | mobile  | original |
| `museum_exterior_scene_desktop_v1.png`  | `museum_exterior_scene`  | primary | original |
| `museum_exterior_scene_mobile_v1.png`   | `museum_exterior_scene`  | mobile  | original |
| `museum_hall_scene_desktop_v2.png`      | `museum_hall_scene`      | primary | original |
| `museum_hall_scene_mobile_v2.png`       | `museum_hall_scene`      | mobile  | original |

## Props and Marcelino poses (7)

| Filename                    | Asset id             | Variant | Source         |
| --------------------------- | -------------------- | ------- | -------------- |
| `marcelino_idle_v1.png`     | `marcelino_idle`     | primary | web derivative |
| `marcelino_mailbag_v1.png`  | `marcelino_mailbag`  | primary | web derivative |
| `marcelino_run_away_v1.png` | `marcelino_run_away` | primary | web derivative |
| `walkman_player_v1.png`     | `walkman_player`     | primary | web derivative |
| `candle_unlit_v1.png`       | `candle_unlit`       | primary | web derivative |
| `candle_lit_v1.png`         | `candle_lit`         | primary | web derivative |
| `museum_artifact_v1.png`    | `museum_artifact`    | primary | web derivative |

## Keys (7)

| Filename                  | Asset id                   | Variant | Source         |
| ------------------------- | -------------------------- | ------- | -------------- |
| `key_shell_v1.png`        | `asset_key_shell_icon`     | primary | web derivative |
| `key_church_cross_v1.png` | `asset_key_candle_icon`    | primary | web derivative |
| `key_music_v1.png`        | `asset_key_music_icon`     | primary | web derivative |
| `key_token_v1.png`        | `asset_key_token_icon`     | primary | web derivative |
| `key_letter_v1.png`       | `asset_key_letter_icon`    | primary | web derivative |
| `key_sunflower_v1.png`    | `asset_key_sunflower_icon` | primary | web derivative |
| `key_everkeep_v1.png`     | `asset_key_everkeep_icon`  | primary | web derivative |

## Crop stage sprites (12)

| Filename                        | Asset id                 | Variant | Source         |
| ------------------------------- | ------------------------ | ------- | -------------- |
| `crop_sunflower_ready_v1.png`   | `crop_sunflower_ready`   | primary | web derivative |
| `crop_sunflower_growing_v1.png` | `crop_sunflower_growing` | primary | web derivative |
| `crop_sunflower_planted_v1.png` | `crop_sunflower_planted` | primary | web derivative |
| `crop_sunflower_wilted_v1.png`  | `crop_sunflower_wilted`  | primary | web derivative |
| `crop_mango_ready_v1.png`       | `crop_mango_ready`       | primary | web derivative |
| `crop_mango_growing_v1.png`     | `crop_mango_growing`     | primary | web derivative |
| `crop_mango_planted_v1.png`     | `crop_mango_planted`     | primary | web derivative |
| `crop_mango_wilted_v2.png`      | `crop_mango_wilted`      | primary | web derivative |
| `crop_blueberry_ready_v1.png`   | `crop_blueberry_ready`   | primary | web derivative |
| `crop_blueberry_growing_v1.png` | `crop_blueberry_growing` | primary | web derivative |
| `crop_blueberry_planted_v1.png` | `crop_blueberry_planted` | primary | web derivative |
| `crop_blueberry_wilted_v2.png`  | `crop_blueberry_wilted`  | primary | web derivative |

## Seed and crop icons (6)

| Filename                     | Asset id                    | Variant | Source         |
| ---------------------------- | --------------------------- | ------- | -------------- |
| `crop_sunflower_icon_v1.png` | `asset_crop_sunflower_icon` | primary | web derivative |
| `crop_mango_icon_v1.png`     | `asset_crop_mango_icon`     | primary | web derivative |
| `crop_blueberry_icon_v1.png` | `asset_crop_blueberry_icon` | primary | web derivative |
| `seed_sunflower_icon_v1.png` | `asset_seed_sunflower_icon` | primary | web derivative |
| `seed_mango_icon_v1.png`     | `asset_seed_mango_icon`     | primary | web derivative |
| `seed_blueberry_icon_v1.png` | `asset_seed_blueberry_icon` | primary | web derivative |

## Achievement badges (4)

| Filename                           | Asset id                          | Variant | Source         |
| ---------------------------------- | --------------------------------- | ------- | -------------- |
| `achievement_first_step_v1.png`    | `asset_achievement_first_step`    | primary | web derivative |
| `achievement_perfect_quiz_v1.png`  | `asset_achievement_perfect_quiz`  | primary | web derivative |
| `achievement_first_harvest_v1.png` | `asset_achievement_first_harvest` | primary | web derivative |
| `achievement_secret_001_v1.png`    | `asset_achievement_secret_001`    | primary | web derivative |

## Map avatar v3 (3)

| Filename                    | Asset id             | Variant | Source         |
| --------------------------- | -------------------- | ------- | -------------- |
| `map_avatar_idle_v3.png`    | `map_avatar_idle`    | primary | web derivative |
| `map_avatar_walking_v3.png` | `map_avatar_walking` | primary | web derivative |
| `map_avatar_arrival_v3.png` | `map_avatar_arrival` | primary | web derivative |

## Sheet rows that still need a decision/edit after upload (not done)

- `09_ICONS`: no rows exist for the six `seed_*_icon` / `crop_*_icon` ids named by `28_FARM_CROPS` — add rows (`format=png`) pointing at `asset_seed_*_icon` / `asset_crop_*_icon`.
- The seven key icon rows currently have `asset_type = svg`, which the media gateway rejects (`MEDIA_UNSUPPORTED_MIME`; supported families are image/audio/video/pdf). Replacing them with the supplied PNGs means `asset_type = image`, the new `drive_file_id`, and `version + 1`; `key_candle` keeps its ids and gets the cross art. Balances and history are untouched.
- `23_ACHIEVEMENTS.icon_id` holds `<ACH_ICON>` / `<SECRET_ICON>` placeholders for the four badges: give them real icon ids and `09_ICONS` rows. The player app has no achievements screen yet, so nothing displays them.
- Scene/sprite/prop rows: one `10_ASSETS` row each, `asset_type = image`; scenes use `mobile_drive_file_id` for the portrait file.
