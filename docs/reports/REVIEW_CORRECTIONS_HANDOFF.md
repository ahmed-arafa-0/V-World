# Manual-review corrections — handoff

Scope: Ahmed's manual-review corrections (map, roads, beach ocean, Walkman, HUD, Church, candles) plus the
eight-screenshot findings (Arcade, Cottage, Marcelino, Farm, Museum, mailbox/reading corner/exhibits, nails corner).
No owner reset, commit, push or deploy. No full live-Sheet journey was run.

## Implemented (code)

- **Map**: markers are positioned in the island image's own 1792×2128 coordinate system inside a plane letter-boxed exactly like the
  image (`mapPlane`, CSS container units), so they follow the painting at any size/orientation. Anchors are pixel-measured on the
  registered `map_island_transparent`. Connecting lines removed. (`MapView.tsx`, `world.module.css`)
- **Roads**: `road_onward` is available on the beach, the steps and the road, and on the Church entrance. The Junction is purely
  physical (Church / Café / onward / Back). Back returns to the exact beach scene the player left; the Church choice opens the Church
  entrance scene. Café exterior and interior are enterable without the Church; the gramophone and song requests stay server-gated and
  explain why (`cafe_story_locked`). The VARcade exterior is walkable; its interior explains (`arcade_story_locked`) until the server opens it.
  Walking never acknowledges a beat or awards a key.
- **Beach ocean**: the shell opens a full-viewport eye-level ocean view with Back/Escape, metadata-first loading, a random start inside the
  seekable range, loop, pause/release on close, loading and failure states with retry. The shell reward is only requested while the shell key is
  not held (the server remains idempotent). Uses logical asset `beach_ocean_eye_level_loop` only, never `map_ocean_loop`.
- **Walkman**: approved `walkman_player` art as a bottom-right control (headphones glyph fallback) opening a panel: play/pause, previous/next,
  playlist with active indication, volume + mute, seek with elapsed/duration, shuffle, repeat off/playlist/one, empty state. Playlist =
  released Café songs flagged `available_in_walkman` with registered audio (hymns excluded server-side). One persistent `<audio>` element, so
  opening/closing never restarts the song.
- **HUD**: map symbol button (accessible name/tooltip kept), five flag buttons (UK/Egypt/Italy/Greece/France ↔ en/ar-EG/it/el/fr) with native
  names and a selected state, separate Log out button. Optional Sheet icons `icon_map`, `icon_logout`, `icon_flag_<locale>` override the fallbacks.
- **Church**: no companion in any Church interior view; Walkman control and panel hidden; Walkman pauses on entry, keeps its position and is
  not auto-resumed on leaving; ambience silent; hymn player fades out then stops on leaving.
- **Candles**: tap lights, tap again puts out (`POST /church/candle/extinguish`, server-side); one request at a time; an occasion candle stays
  lit; `candlesLitEver` is never touched, so no key can be farmed. New focused **candle corner** view with a Back control; candles show exactly the saved state.
- **Arcade**: cabinet screens show the localized game name and a state (Play / Locked · costs N / Empty cabinet); scoreboard uses names.
  Locked machines still unlock only through the server.
- **Cottage**: decoration slots seat on the painted hutch's two shelf boards; mantel countdown fields carry localized unit captions; cat home
  is anchored on the kennel, Marcelino's home on the rug beside his sprite (absence/schedule rules untouched); mailbox and reading corner
  distinguish loading / failed (with retry) / empty.
- **Farm**: empty plots show a "+" and a strong dashed target; planted plots show a crop + state chip; selection highlights the plot and the
  panel names the crop and state. Focus outlines kept.
- **Museum**: raw ids (`archive_wing`, `exhibit_comic_name`, position ids) are never displayed — Sheet label or a localized generic word;
  a closed wing shows one closed message; exhibits distinguish failed load (retry) / not written yet / empty.
- Backend: `extinguishCandle` + route. Contracts: new five-language keys (`world-ui-text.ts`).

## Verified

- `apps/web`: tsc, eslint, 369 vitest tests pass; `apps/functions`: tsc, 514 tests pass (incl. new extinguish test); contracts rebuilt.
- New tests: `reviewCorrections.test.tsx`, `reviewCorrectionsViews.test.tsx` (Walkman panel/silence, Church audio transitions, candle
  toggles + burst guard, direct Café access, ocean states + random start, map anchors, Arabic name, Museum/Arcade/Farm/Cottage states).
- Second pass, against the rebuilt local preview (http://127.0.0.1:5050, real backend/Sheet, isolated test players `verify_review_*`,
  headless Chromium): beach/steps → crossroads directly (Church entrance never shown; Back returns to the same beach scene);
  Church interior has no cat and no Walkman, ambience paused; candle light → out → light gives 3 requests, one `awarded` reward, key stays 1;
  map markers on buildings at 1440×900 and 393×852; Walkman art/panel/empty state; portrait Cottage shelf slots and Farm beds checked
  on the real `variant=mobile` paintings; Walkman corner kept clear of navigation.
- Build/typecheck/lint exit 0; `format:check` flags only pre-existing `docs/reports/*` files.
- Not run: Playwright e2e suite, full live journey. Hymn fade-out only unit-tested (no hymn audio registered).

## Awaiting media / content

| Item                   | Needed                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beach ocean            | Register logical asset **`beach_ocean_eye_level_loop`** (video, eye-level, seamless loop, seekable/faststart MP4; optional poster). The existing `asset_ocean_loop` row is still an unfilled placeholder.                                                                                                              |
| Candle corner close-up | New scene **`church_candle_corner_scene`** (1672×941 landscape + portrait variant): the brass tray and plinth with **no candles and no flames**; empty tray top edge clearly visible. Calibrate `boxes.candles` in `placeComposition.ts` (`church-candle-corner`) to it. Until then a labelled temporary visual shows. |
| Baked flames           | The painted `church_interior_scene` bakes six lit candles into the corner (left, y≈60%). They cannot be extinguished without a clean plate: supply **`church_interior_scene` clean version** (same size/portrait variant) with candles unlit or removed. No opaque patch was used.                                     |
| Museum / exhibits      | `08_UI_TEXT` rows for each wing (`museum_<wingId>`) and exhibit `display_name_text_id` in five languages; exhibit content (images/audio/PDF/archive) where still empty.                                                                                                                                                |
| Arcade                 | `08_UI_TEXT` game-name rows (`displayNameTextId`) in five languages; the cabinet screens fall back to "Game".                                                                                                                                                                                                          |
| Walkman / hymns        | Enabled songs with registered audio: none exist, so the playlist is empty and no hymn can play. Optional icon rows: `icon_logout`, `icon_flag_<locale>`.                                                                                                                                                               |

## Reports

- **Nails corner**: no interaction exists anywhere in code, contracts or backend. The painted polish shelf on the desk (≈7–14% x, 40–50% y
  of the Cottage interior) is decoration only. Nothing was added.
- **Companion-home label**: `cottage_var_place` already resolves through `withCompanionName` with the chosen name. I could not reproduce an unresolved
  label offline; it depends on `/character/var` returning the name, otherwise the neutral localized "your companion" is used.
- **Marcelino home**: only the marker moved (onto the rug beside his sprite); no art exists for a chick home.
- **Convention change**: `junction_locked_*` texts are no longer used by the Junction.
- Confirmed: no later milestone work, no Gemini, no Firebase Storage, no voice-over, no stars.
