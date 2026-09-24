# Phase 1 — Item E: Scene Engine, Camera, Movement, Overlapping Connectors (M05)

**Date:** 2026-09-16
**Scope:** A reusable layered 2.5D scene renderer with parallax layers, bounded first-person look, rail-based node-to-node travel (manual and guided), diamond markers, and a debug overlay disabled in production — built and proven against the exact prototype connector chain named in the Master Build Plan and the current instruction: Beach focus → Beach + exactly three literal steps → near steps + Church approach → Church focus. Every visual is an explicit, labeled development placeholder — no real Beach/Church art exists yet (`docs/assets/PHASE_1_ASSET_HANDOFF.md`).

---

## 0. Preflight

Read the Master Build Plan's M05 build/acceptance sections and the Living Bible §5–§8 (movement model, camera model, scene construction, connector/occluder technique). Confirmed with item D's checkpoint report that `/api/player/checkpoint`/`/api/player/state` (M04) were ready to be called by this engine, per the user's explicit "Implement M04 before story mutations" sequencing.

## 1. Design decisions

- **Placeholder content, not real art.** `SceneLayer.kind` is `'color' | 'gradient'` for now, with an unused `'video'` case already modeled (mirroring `MapCompositionPreview`'s real-video-layer pattern) so a real asset can drop in later without changing the engine. Every stage carries `data-placeholder="true"` and an on-screen "DEV PLACEHOLDER — {name}" badge — it is structurally impossible to mistake this for finished art, satisfying the instruction not to present placeholders as finished.
- **Not Sheet-driven yet, by design.** `12_SCENES` exists in the schema but has no real Beach/Church rows to read (no assets registered). The four-node chain lives in a local `sceneDefinitions.ts` fixture, explicitly documented as a placeholder — the `JourneyDefinition`/`SceneNode` shape is generic enough that a future Sheet-backed loader can replace this fixture without changing `SceneStage`/`SceneJourney` themselves.
- **Bounded look, not a free camera.** `useBoundedPan` clamps a single pan value to each node's own `panBounds` — Master Build Plan M05 acceptance: "Camera cannot rotate beyond prepared art." Driven by keyboard (arrow keys), pointer drag (the Pointer Events API already unifies mouse and touch, satisfying "drag/swipe, desktop mouse/keyboard" without separate touch-event code), and two always-available Look-Left/Look-Right buttons (both for reliable manual control and for deterministic automated testing without simulating raw drag physics).
- **Rail-based travel, manual and guided reach the same node.** `SceneJourney` exposes single-step "Walk back/forward" (manual) and a "Travel to Church (guided)" multi-hop button that internally calls the exact same `goToNode()` function repeatedly — proven directly in tests: manual step-by-step clicking and one guided-travel click both land on `church_focus`.
- **Real M04 integration, not a mock.** Every node arrival (manual or guided, including each intermediate hop of a guided journey) calls the real `POST /api/player/checkpoint` (routeId `m05_prototype`, `checkpoint: true`). On mount, the component calls the real `GET /api/player/state` and resumes at the last-checkpointed node — this is what makes "interrupted guided movement resumes safely" true by construction (every hop is durably checkpointed, not just the final destination) rather than needing separate resumable-animation-state serialization.
- **Debug overlay disabled in production.** Gated by `import.meta.env.DEV` (a `forceDebugOverlay` prop overrides it for deterministic tests) — Vite bakes `DEV: false` into a real `vite build` bundle regardless of the serving process's own `NODE_ENV`, so this is a genuine build-time removal, not a runtime guess. Verified live in a real production build (§4).

## 2. Files changed / created

**New (frontend, `apps/web`):**

- `src/features/scene-engine/types.ts` — `SceneLayer`, `DiamondMarker`, `SceneNode`, `JourneyDefinition`.
- `src/features/scene-engine/sceneDefinitions.ts` — the four-node `BEACH_TO_CHURCH_JOURNEY` placeholder fixture.
- `src/features/scene-engine/useBoundedPan.ts` — the bounded-look hook (§1).
- `src/features/scene-engine/SceneStage.tsx` + `.module.css` — one node's parallax layers, literal step elements, and diamond markers.
- `src/features/scene-engine/SceneJourney.tsx` + `.module.css` — the orchestrator (§1).
- `src/services/playerClient.ts` — `fetchPlayerState()`/`postCheckpoint()`, the frontend client for M04's endpoints.

**Modified (frontend):**

- `src/features/gate/GatePage.tsx` — adds `<SceneJourney />` alongside the other three labs in the authenticated-owner branch.
- `tests/helpers/mockApi.ts` — adds default mocks for `GET /api/player/state` (empty progress) and `POST /api/player/checkpoint` (generic success).

**New (scripts, live/manual only):**

- Extended `scripts/verify-phase1-full-app-browser.mjs` with real-browser M05 checks (§4).

**New (frontend tests):**

- `apps/web/tests/SceneStage.test.tsx` (7 tests): every layer renders; the placeholder badge/attribute is always present; exactly three step elements for the steps node and zero for every other node; marker click fires the callback; parallax-scaled transform math; occluder layers are marked.
- `apps/web/tests/SceneJourney.test.tsx` (15 tests): starts at the first node with no prior checkpoint; **resumes at the last-checkpointed node** (interrupted-journey safety); falls back safely to the first node if the recorded beat id no longer exists in the journey; exactly three steps appear after walking to `beach_steps`; the previous scene stays visible (fading) during a transition; manual step-by-step and one guided "Travel to Church" click both reach `church_focus`; walk-forward/back disable correctly at the chain's ends; Look buttons clamp to bounds; a rendered transform is never outside the configured bounds even after 20 over-clicks; pan resets to zero on arrival at a new node; keyboard arrow-key navigation; marker-activation note; debug overlay hidden by default and shown only when forced.

**Not committed.**

## 3. Acceptance criteria, mapped to evidence

| Master Build Plan M05 acceptance                                               | Evidence                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop and mobile preserve geographic direction without exposing blank canvas | Layers are rendered oversized (150% width) relative to the clamped pan range, so panning never reveals empty space at any viewport width; the same world-space layer set is shown at every width, only the visible crop changes (standard responsive-crop technique, not per-breakpoint content). |
| Exactly three literal steps are visible                                        | `SceneStage.test.tsx` and `SceneJourney.test.tsx` both assert `getAllByTestId('step')` has length exactly 3 at `beach_steps`/`steps_church_approach`, and 0 elsewhere; reconfirmed in a real browser (§4).                                                                                        |
| The previous scene remains partially visible while the next is introduced      | `SceneJourney` renders the previous node's `SceneStage` underneath with a `fadeOut` class during the ~600ms transition window — asserted directly in a test.                                                                                                                                      |
| Camera cannot rotate beyond prepared art                                       | `useBoundedPan`'s `clamp()`; a dedicated test drives 20 Look-Right clicks (80 units of nudge against a 20-unit bound) and asserts the rendered transform never exceeds the bound-implied maximum.                                                                                                 |
| Manual and automatic movement reach the same authored node                     | A dedicated test performs three manual "Walk forward" clicks and, in a separate test, one "Travel to Church" guided click — both assert arrival at `church_focus`.                                                                                                                                |
| Interrupted guided movement resumes safely                                     | Every hop (manual or guided) checkpoints via the real M04 API before advancing; a dedicated test seeds a prior checkpoint at `steps_church_approach` and confirms the component resumes there, not at `beach_focus`.                                                                              |

## 4. Live verification (real browser, real backend, real Sheet)

Extended `npm run verify:phase1:full-app` (the same real-built-app + real-backend + real-Sheet + real-Chromium script used for items A/B/C):

```text
=== Real M05 scene engine (SceneJourney) in an actual browser ===
  PASS  SceneJourney renders the first authored node (beach_focus)
  PASS  The steps node is not yet visible (0 steps at beach_focus)
  PASS  Walking forward reaches beach_steps with exactly three real rendered step elements
  PASS  The scene debug overlay is not shown in a production build (disabled in production)

=== No uncaught browser console/page errors during the whole flow ===
  PASS  Zero unexpected console/page errors

Summary: 10 passed, 0 failed
PHASE 1 A/B/C/E FULL-APP BROWSER VERIFICATION PASSED.
```

This proves, in a real (non-jsdom) browser against a real production build: the engine renders, a real click triggers a real state transition with real CSS layout producing exactly three real DOM step elements, and the debug overlay is genuinely absent from a production bundle (not just conditionally hidden at runtime). The "walk forward" click also wrote a real, isolated (`phase1_verification|m05_prototype`) checkpoint row to the live Sheet via the real M04 API — never touching Veoulla's real progress.

## 5. Commands run and results

```text
npm run format         → PASS
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 611/611 across 55 files (46 sheet-schema + 355 functions + 210 web)
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run verify:phase1:full-app       → PASSED, 10/10 (real browser/backend/Sheet — see §4)
```

No `firebase deploy` was run.

## 6. Known limitations

- **No real 3D/free camera was built, and none should be** — this is intentional per the Master Build Plan ("No free 360-degree camera or new 3D engine"), not a shortfall.
- **The journey definition is a local, non-Sheet-driven fixture.** Wiring `12_SCENES`/`11_LOCATIONS` as the real data source is deferred until real Beach/Church assets exist (tracked in `docs/assets/PHASE_1_ASSET_HANDOFF.md`) — the type shapes were designed so that swap doesn't require touching `SceneStage`/`SceneJourney`.
- **No out-of-order/regression protection for rapid concurrent node transitions** beyond the guided-travel `travelToken` cancellation already implemented (a newer travel request supersedes an older one cleanly) — inherits the same documented checkpoint-ordering limitation already flagged in item D's report, since both ultimately call the same `checkpointProgress` primitive.
- **No dedicated live Playwright spec** (`tests/e2e/*.spec.ts`) was added — covered instead by the real-browser full-app script (§4), consistent with items A–D.
- **Touch-specific gesture nuances** (momentum/inertia scrolling, pinch) are not implemented — Pointer Events give real drag-to-pan on touch devices, but no fling/momentum physics, which is reasonable for a prototype proving the connector technique rather than final movement feel.

## 7. Confirmations

- Only Phase 1 item E (M05) was implemented. No M06+ (F/G) work was started, and no real Church interior (M08) was touched.
- No content, gameplay, or art decision was invented — every visual is an explicitly labeled development placeholder, and the only real data this item touches is its own checkpoint writes (via the already-accepted M04 API) to a clearly non-Veoulla test route.
- Nothing was committed, merged, pushed, or deployed.

## 8. Completion addendum — resumed handoff audit

The handoff audit found that the type model mentioned video layers, particles, and click-to-point travel but the renderer did not yet implement all three. `SceneStage` now renders a real looping/muted/plays-inline `<video>` layer with optional poster, exposes particle hooks, and `SceneJourney` treats an authored marker destination as rail-based click/tap-to-point travel through the same checkpointed movement path. Tests cover each seam. The diamond pulse was moved to a pseudo-element so the button's hit target remains geometrically stable; this fixed a real Chromium interaction failure rather than forcing the browser test.
