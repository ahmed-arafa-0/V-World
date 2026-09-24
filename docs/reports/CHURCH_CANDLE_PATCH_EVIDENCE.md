# Church candle patch — evidence

Source: `assets/Veoulla_Church_Candle_Patch/CLAUDE_HANDOFF.md`. No commit, push, or deploy. No owner reset — every
live check below used an isolated `verify_review_fresh_*` test player, never Ahmed's own progress.

## Code changes

See the previous entry in this report's history for the full add/remove/capacity implementation (contracts,
`world/state.ts`, `world/church.ts`, `api/world.ts`, the seed service, `candleTray.ts`, `ChurchView.tsx`,
`placeComposition.ts`, `SceneIcon.tsx`). This pass adds one real bug fix found only once real art existed to test
against, plus a small calibration refinement:

- **`ChurchTray` extracted as its own component, rendered as a genuine JSX child of `<Stage>`.** The candle tray's
  `usePlaneRect('candles')` call had been living in `CandleCorner` — the same component that _creates_ the
  `<Stage>` — not inside it. React context only reaches components that are actual descendants of the provider;
  a component can't consume a context provided by an element it is about to return. The box therefore always
  resolved to `undefined`, however long the art had already loaded, and the tray silently fell back to the
  plain flex-row layout every time. No offline/jsdom test could catch this (jsdom never loads real images, so
  every prior test exercised only the fallback path) — it only showed up once real corner art was registered and
  checked in an actual browser. Fixed by moving the tray's rendering into a new `CandleTray` component nested
  inside `<Stage>`, matching the pattern every other box-using view in this codebase already follows (Arcade's
  `Cabinet`, Cottage's `MantelCountdown`, Farm's `PaintedBed`).
- Candle-corner tray box height trimmed (`[14,57,69,14]`→`[14,57,69,11]` desktop, similarly on mobile) after
  seeing the first real render: candles landed right at the tray's front brass rim rather than clearly on the
  sand. Re-verified after the change — bases now sit grounded on the sand.

## Live Drive / Sheet registration — **done**

`npm run seed:church-candle-patch` against the live Sheet/Drive:

```
Expected 4 filenames; found 4.
  FOUND     church_interior_scene_desktop_v2.png
  FOUND     church_interior_scene_mobile_v2.png
  FOUND     church_candle_corner_scene_desktop_v1.png
  FOUND     church_candle_corner_scene_mobile_v1.png
  CREATED   10_ASSETS.church_candle_corner_scene (version 1)
  UPDATED   10_ASSETS.church_interior_scene (version 2)

created 1, updated 1, unchanged 0, blocked 0
```

**Idempotent rerun** immediately after:

```
created 0, updated 0, unchanged 2, blocked 0
```

Both rows report `UNCHANGED` — no second write, confirmed via `10_ASSETS`'s own version column staying put.

Media, fetched live through the real gateway (`GET /api/media/<id>?v=<version>`) and hashed:

| asset                        | version | SHA-256 served          | matches supplied file                                            |
| ---------------------------- | ------- | ----------------------- | ---------------------------------------------------------------- |
| `church_interior_scene`      | 2       | `e91072e0…8dacc9ce748e` | ✅ byte-identical to `church_interior_scene_desktop_v2.png`      |
| `church_candle_corner_scene` | 1       | `92ca02e0…8b755c4e67`   | ✅ byte-identical to `church_candle_corner_scene_desktop_v1.png` |

## Both Church views checked, desktop and mobile

Isolated `verify_review_fresh_*` players, rebuilt local preview (real backend/Sheet):

- **Interior** (1440×900 and 393×852): `stage-painting` src is `/api/media/church_interior_scene?v=2` on both.
  Screenshots confirm the brass tray at lower-left is **empty sand — no baked-in candles**; wall lanterns intact;
  no cat, no Walkman control/panel.
- **Candle corner** (1440×900 and 393×852): `stage-painting` src is `/api/media/church_candle_corner_scene?v=1` on
  both. All 6 original candles render on the real tray in two rows (back row smaller/higher, front row
  larger/lower), grounded on the sand after the box fix above; Add/Remove controls and the numbered chip strip
  render correctly; no cat, no Walkman.
- Confirmed the interior's candle-corner _hotspot_ (the one that opens this view) also lands correctly in
  portrait, at the tray's real position (an existing mobile miscalibration against the old art — `[41,66]`,
  mid-aisle — was corrected to `[8,93]` in the same pass that added Add/Remove).

## Full regression after the fix

Ran again after the `CandleTray` extraction and the box tweak (both are source changes, not just registration):

- `npm run test` (sheet-schema + functions + web): all pass.
- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm run format:check`: flags only the same pre-existing, unrelated `docs/reports/*` files as before.

## Local art structure

Unchanged from the prior pass: the 4 PNGs are copied into `assets/veoulla-art-pack/phase2/{scenes,closeups}/`
alongside the untouched `_v1` originals, and appended (not altered) to `asset_manifest.json`/`.csv`. `assets/` is
gitignored — none of this is tracked by git.

## Known limitation

Tray-box coordinates are still a visual measurement (±1–2%), now checked once against the real render and
corrected once; further fine pixel polish was not pursued to avoid another round of live-Sheet churn beyond what
was asked.
