# Phase 1 Progress Log

**Purpose:** Resumable, per-item status for Phase 1 (see `docs/plans/THREE_PHASE_DELIVERY.md` for scope/attribution). Update this after every internal checkpoint so a new session can continue without repeating accepted work or re-deriving baseline.

## How to resume

1. Read `CLAUDE.md`, `docs/Veoullas_World_Living_Bible.md`, `docs/Claude_Code_Master_Build_Plan.md`, this file, and the latest checkpoint report under `docs/reports/`.
2. Run `git status` and `git log --oneline -5` — do not assume this file is more current than the working tree; reconcile if they disagree.
3. Find the first item below that is not `Done`, read its "Next action" line, and continue there.
4. Never mark an item `Done` without: format/lint/typecheck/test/build passing, a checkpoint report under `docs/reports/M0X_*` or `docs/reports/PHASE1_*`, and explicit confirmation that no later-phase work was started.

## Baseline at Phase 1 start (2026-09-16)

- Tip commit: `d2489ce` — "M03-B1 — Google Drive Media Gateway Foundation." Working tree clean.
- Accepted through: M00, M01, M02 (A/B2/C), M03-A (localization/content-runtime), M03-B1 (Drive media gateway backend foundation, no service-worker/browser cache, no voice-over player yet).
- Repo shape confirmed: `apps/web/src` (React/Vite/TS), `apps/functions/src` (Express-behind-one-function backend: `api/`, `google/`, `http/`, `repositories/`, `services/`, `config/`, `errors/`), `packages/{contracts,sheet-schema,test-fixtures}`.
- `npm run test` (last known, per M03-B1 checkpoint): 464/464 passing across 42 files — reconciled and reproduced exactly in Phase 1 item A (see `docs/reports/PHASE1_A_CHECKPOINT.md` §4). After items A+B (including B's post-review addendum): **507/507 passing across 46 files** (46 sheet-schema + 317 functions + 144 web). `npm run test:e2e`: credential-gated tests skip without `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD` (not set in this environment either) — this is a standing, deliberate limit: Ahmed's real Gate code is never read, guessed, or used by Claude, including via the service account's own Sheet-read access. Real-browser (non-jsdom, non-credential-gated) verification of the media gateway is separately covered by `npm run verify:phase1:map-media-browser` (see PHASE1_B_CHECKPOINT.md §9.3).
- Known open item carried from M03-B1's own "known limitations": the real, ongoing `05_ENTRY_LOGS.language` schema-health mismatch (`navigator.language` values like `"en-US"` never match the app's five-code `locale` controlled list) — explicitly flagged there as out of scope for that milestone and deferred. This is item **A** below.

## Item status

### A. Verify/fix remaining M03-B1 work (media gateway hardening + entry-log locale normalization)

**Status: Done** — see `docs/reports/PHASE1_A_CHECKPOINT.md`.

Scope actually covered: read-audited the M03-B1 media gateway's MIME/range/HEAD/stream-completion/disconnect behavior (§4–§7 of the M03-B1 checkpoint) against the Living Bible/Master Build Plan requirements; found it already compliant (no bugs required fixing in `media.ts`/`drive-gateway.ts`/`byte-range.ts`/`media-headers.ts`); implemented the deferred entry-log locale normalization (new `normalizeEntryLogLocale()` in `entry-log.service.ts`, applied at the single write choke-point so every current and future caller is covered); documented the private-session cache policy for media responses (`Cache-Control: private, ... immutable` is per-browser-profile, not revoked by logout — documented explicitly, no code claims otherwise); confirmed auth/error responses are never cached (no `Cache-Control` header is set on any `sendError` path) and that a `206` partial response is never treated as a complete file by any current caller (there are no current media consumers yet — this is a forward-looking contract check, re-verified again once the M03-B2/voice-over player consumes this endpoint in item C).

### B. Register the map assets (island + ocean loop + poster) through the real schema/gateway

**Status: Done** — see `docs/reports/PHASE1_B_CHECKPOINT.md` (including its §9 addendum).

Registered `map_island_transparent` (image, transparent PNG/WebP) and `map_ocean_loop` (video, with the ocean poster as its `poster_drive_file_id` variant — reusing the M03-B1 poster-variant mechanism rather than a third asset row) into `10_ASSETS` via a new idempotent seed script (`scripts/seed-phase1-map-assets.mjs`, mirroring the M02 seed pattern). Added a **server-side development-only-gated** `MapCompositionPreview` lab (parallel to `ContentRuntimeLab`) that layers the island over the looping ocean via the existing `/api/media/:assetId` gateway — explicitly labeled as a dev preview, not the real Map (which stays locked until M14/Phase 2). Confirmed no raw Drive ID is embedded in frontend source or any runtime response.

**Addendum (same day, post-review):** Ahmed's review found the preview was originally gated only by an owner session + on-screen label, not a real access boundary. Fixed with a genuine server-side boundary: `GET /api/dev/map-preview-assets` 404s in `staging`/`production` **before** checking auth (`development-only-middleware.ts`), verified live under a real `NODE_ENV=production` process (not just an injected test double). Also ran a real-Chromium browser verification (`npm run verify:phase1:map-media-browser`) proving the media gateway serves actually-decodable/playable bytes and correct byte-range responses to a real browser — distinct from the earlier metadata-only preflight and jsdom-based component tests. Test-count discrepancy (492−464=28 vs. the originally-stated 26) reconciled: the other 2 come from `import-boundary.test.ts`'s per-file dynamic scan picking up 2 new frontend source files, not an error. Final totals: **507 tests / 46 files**, all passing.

### C. Finish M03 voice/caption runtime (five locales, missing-file continuation, pause/replay, autoplay gesture, audio handoff manifest)

**Status: Done** — see `docs/reports/PHASE1_C_CHECKPOINT.md`.

Built `VoiceoverPlayer`/`useVoiceoverPlayback`/`resolveVoiceoverCue` (all frontend-only — the M03-A backend already resolved `voiceoverMediaRef`/`mediaRef`, no change needed) and the `VoiceoverRuntimeLab` acceptance screen, added to `GatePage.tsx` alongside the other two labs. Live-Sheet inspection found two real pre-existing dialogue groups (`dlg_gate_01` fully registered but pointing at unfilled placeholder Drive IDs; `dlg_name_01` with no matching voiceover row and missing it/el/fr locales) that exercise every required missing-file/fallback path with real data — no fixture content needed to be invented. Extended `npm run verify:phase1:full-app` (a real built app + real backend + real Sheet + real headless Chromium, with a minted, never-Gate-code-derived owner session) to prove, live: all three lab screens render, a real caption renders from real Sheet content, and the real `dlg_gate_01` 404 is caught by the player and correctly shown as "unavailable — caption only" without crashing. Audio handoff manifest populated in `docs/content/PHASE_1_VOICEOVER_CUES.md` §5 with the real, current gap list. Final totals: **543 tests / 49 files**, all passing.

### D. M04 — Player state, checkpoints, keys, idempotent rewards

**Status: Done** — see `docs/reports/PHASE1_D_CHECKPOINT.md`.

Built `player-progress.service.ts`/`player-keys.service.ts`/`player-achievements.service.ts` and six owner-session-protected `/api/player/*` routes (state read, checkpoint, route-complete, key award/spend, achievement claim). Caught and fixed a real bug before it shipped: the composite primary keys must use `|` (e.g. `veoulla|first_journey`), matching the live Sheet exactly — an initial `:`-based draft was corrected after checking the real Sheet, not just the fixture. Idempotency reuses existing columns rather than inventing new schema (daily-cap date+source-id for awards, a boolean flag for one-time achievement claims, a documented simplified "last transaction" marker for spend — see the checkpoint's §2 for the honest limitation on that last one). `KeyMutex` now also serializes the service-level read-decide-write sequence for key mutations, proven directly with a raced-concurrency test. Live-verified end-to-end against the real Sheet using a clearly-isolated fake test user (`phase1_d_verification_user`) — confirmed afterward that Veoulla's real `24_PLAYER_PROGRESS` row was untouched. `first_journey_completed`/`map_unlocked` are never read or written by this item (reserved for M14/Phase 2). Final totals: **581 tests / 53 files**, all passing.

**Dependency for E/F/G:** satisfied — D's checkpoint/reward APIs are ready for E/F to call.

### E. M05 — Scene engine, camera, movement, overlapping connectors

**Status: Done** — see `docs/reports/PHASE1_E_CHECKPOINT.md`.

Built `SceneStage`/`SceneJourney`/`useBoundedPan` — a layered parallax renderer, bounded first-person look (keyboard/pointer-drag/buttons), and rail-based node travel (manual step + guided multi-hop, both provably reaching the same node) — against the exact named prototype chain (Beach focus → Beach + three steps → near steps + Church approach → Church focus). Every visual is an explicit, labeled development placeholder (no real Beach/Church art exists yet). Real integration with D: every node arrival calls the real `/api/player/checkpoint`, and the component resumes at the last-checkpointed node on mount — proven both in unit tests and live in a real browser against the real Sheet (extended `verify:phase1:full-app`), including confirming the debug overlay is genuinely absent from a real production build. Final totals: **611 tests / 55 files**, all passing.

**Dependency for F:** satisfied.

### F. M06 + M07 — First Opening (Bootstrap/Gate) and Marevi Cove/naming

**Status: Done** — see `docs/reports/PHASE1_F_CHECKPOINT.md` (including its completion addendum).

Built the Sheet-title-driven black/title/unseen-VAR/reveal sequence before the existing four dials; the post-auth doors placeholder; the correct Cove-arrival → naming → collar-confirmation → Beach-exploration order; character-state persistence; scene-level resume checkpoints; and the introductory shell interaction. The Beach key type is read from `11_LOCATIONS` through the sanitized bootstrap contract and awarded through M04's idempotent API; it is never hardcoded in the interaction. Missing real Gate/VAR/Cove art, SFX, and approved voice recordings remain explicitly isolated placeholders/handoff items. A production build contains no rendered Map preview and no Map-unlock mutation. Final combined automated total after G: **686/686 across 64 files**. The direct real-app Chromium verifier passed **20/20** across its final A–G desktop/mobile path. The Firebase-emulator Playwright suite also started successfully with `FUNCTIONS_DISCOVERY_TIMEOUT=60`; it completed with 46 passed, 14 expected secret-gated skips, 1 flaky first-attempt backend-start check, and 1 failure caused by a real Google Sheets 429 during the mobile pre-Gate repeat. That external quota result is recorded honestly in the final evidence rather than described as an application pass.

**Dependency:** D, E.

### G. Extension points for later locations/events/audio policy

**Status: Done** — see `docs/reports/PHASE1_G_CHECKPOINT.md`.

Added an unpopulated `WorldRuntimeExtensions` registry with stable slots for the eight Sheet location IDs, a typed audio-policy vocabulary capable of expressing the locked Church/Café/Arcade rules, location-entry callbacks, and deterministic event-overlay registration. `SceneJourney` consumes these seams generically. Tests populate only fixture policies/overlays; production code contains no Church interior, Café song system, Arcade game, birthday overlay, or other Phase 2/3 gameplay.

**Dependency:** best done alongside E/F, not as a separate pass.

### H. Voice-over removal (Ahmed's product decision, 2026-09-17)

**Status: Done** — see `docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md`.

Ahmed removed voice-over from the entire experience across all three phases, superseding item C's original "voice/caption runtime" scope and the earlier text-only-then-voice-over decision recorded in the Living Bible. Item C's own historical description above is left unedited (it is what was actually built and accepted at the time); this item records the subsequent change. Replaced the `voiceover/` frontend module (`VoiceoverPlayer`, `useVoiceoverPlayback`, `resolveVoiceoverCue`, `VoiceoverRuntimeLab`) with a `narrative/` module (`DialogueText`, `ContinueButton`, `resolveDialogueCue`) plus a `NarrativeRuntimeLab`; `computeContentRuntime()` no longer reads `16_VOICEOVER` or exposes a `voiceover` field; `RuntimeDialogueLine`/`RuntimeVoiceoverEntry` contracts updated accordingly; `PreGateContentResponse` gained a `uiText` field (just `action_continue`) since text-only progression needs a Continue action before any owner session exists. `16_VOICEOVER`'s tab and historical rows, and `15_DIALOGUE.voiceover_id`'s historical values, are untouched in the Sheet — this is a runtime-read reduction, not a schema migration. Background music/Walkman/ambience/SFX code (the Drive media gateway, `MapCompositionPreview`, Church/Café/Arcade audio-policy seams from item G) is entirely unmodified.

### I. Real Phase 1 artwork handoff — discovered, registered, and live-verified (2026-09-18)

**Status: Done.** See `docs/assets/PHASE_1_ASSET_HANDOFF.md` §0/§6/§7/§8 for full detail.

Ahmed supplied 16 real, final PNGs for the Gate/Beach/Church backgrounds (desktop+mobile) and the VAR/Veoulla character (idle no-collar/collar, walk, jump) — staged locally at `assets/phase1/` (`.gitignore`d, never committed), then uploaded into the configured Drive asset root preserving the exact manifest filenames. This backend's Drive client is deliberately read-only, so a read-only filename-discovery capability was added instead of asking for individual file IDs: `GoogleDriveClient.findFilesByName()` + `DriveGateway.findUniqueUnderRoot()` (exact-name search, proven containment under the root, reports `missing`/`ambiguous` rather than guessing). `scripts/seed-phase1-scene-assets.mjs` (`npm run seed:phase1:scene-assets`) ran this discovery for all 16 filenames — all found, unique, valid — and idempotently created all 10 `10_ASSETS` rows in one pass; a second run confirmed idempotency (10 unchanged).

The scene engine (`SceneNode.backgroundAssetId`, `SceneStage`'s `backgroundAsset`/`companionAsset` props), `sceneDefinitions.ts`'s four real nodes, `SceneJourney`/`BeachArrival`/`DoorsOpeningTransition`/`NamingPrompt` all resolve their real asset id against the live asset list and now show real art. `var_walk_collar` (walking companion) is wired as a screen-space overlay on `SceneStage`, always the collared pose (naming is already complete by the time `SceneJourney` mounts). Per Ahmed's explicit 2026-09-18 authorization, the public pre-Gate contract was deliberately widened for exactly two ids (`gate_closed_bg`, `var_idle_no_collar`) through a new, separate, allowlist-gated `GET/HEAD /api/public-media/:assetId` route — never through the owner-session-protected `/api/media/:assetId`, which is unmodified.

**Two real bugs were found and fixed by live-Chromium verification** (`npm run verify:phase1:real-art`), neither visible to jsdom unit tests: (1) the Gate background was invisible — `.page` had `position: relative` without an explicit `z-index`, so `.pageBackgroundImg`'s `z-index: -1` escaped its intended stacking context and painted behind the whole app shell (data was always correct; pure CSS bug, fixed by adding `z-index: 0`); (2) placeholder "occluder" layers are full-stage opaque color blocks, and kept covering real scene photos completely on `beach_steps`/`steps_church_approach` — fixed by skipping every placeholder layer, occluders included, once a real background resolves. Final live result: desktop 28/28 checks passed; mobile's run got most of the way through before hitting a genuine external Google Sheets 429 from this session's own repeated live runs (not a code defect — every mobile check that did run, including both live-fixed bugs, passed independently across the session's several runs). Manual screenshot review (`docs/reports/PHASE1_REAL_ART/`, not committed) confirms all six scene/Gate photos, the walking companion, and the naming-prompt collar art all render correctly and well-composited; one minor non-blocking cosmetic note (Gate title text contrast against the new dark background) is flagged in the handoff doc but not fixed, since it wasn't asked for.

Verified: `npm run typecheck`, `npm run lint`, `npm run test` (724/724 — 46 sheet-schema + 419 functions + 259 web) all pass. No commit/push/deploy was performed. A local, non-deployed preview server (`npm run preview:local`, serving the real built app + real backend on `http://127.0.0.1:5050`) is available for interactive checking.

**Next action:** none required for Phase 1 art integration itself. Optional follow-ups Ahmed may want: nudge the Gate dial/hotspot vertical position slightly to sit closer to the illustrated keyhole, and/or improve the Gate title text contrast against the new background.

## Outstanding documentation deliverables (tracked, not yet written unless noted)

- `docs/assets/PHASE_1_ASSET_HANDOFF.md` — **started** (see file; will grow as B/C/E/F identify concrete new-asset needs).
- `docs/content/PHASE_1_VOICEOVER_CUES.md` — **retired 2026-09-17** (see item H; kept only as history, not maintained further).
- `docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md` — **written** for item H.
- `docs/reports/PHASE1_A_CHECKPOINT.md`, `docs/reports/PHASE1_B_CHECKPOINT.md` — written alongside items A/B.
- `docs/reports/PHASE_1_EVIDENCE.md` — **written** after A–G reached `Done`; contains final commands, actual results, browser evidence, limitations, and boundary confirmations.

## Open product decisions encountered so far (isolated, not blocking independent work)

- **Resolved by item H (2026-09-17), not by inventing a public-media design:** the pre-Gate captions-only limitation (`/api/media/:assetId` being owner-session protected) is moot now that voice-over is removed entirely — there is no pre-Gate audio need at all, so no unauthenticated media path was opened.
- The live Sheet's existing `dlg_gate_01`/`dlg_name_01` wording approval status remains unresolved; the runtime displays the live rows but does not claim they are approved scripts.
- Final gender/presentation options remain open. Phase 1 uses an open-ended field and stores the chosen value rather than hardcoding a supposedly final enum.
