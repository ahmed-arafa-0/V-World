# Phase 1 — Item B: Register Map Assets Through the Real Schema/Gateway

**Date:** 2026-09-16
**Scope:** Register the transparent island image, top-down ocean loop video, and ocean poster (all supplied directly by Ahmed in the current instruction) into `10_ASSETS` via the typed Sheet gateway; add a developer-only live-map composition preview that proves the two assets compose correctly through the existing M03-B1 media gateway. The Map itself remains locked until M14 (Phase 2); `first_journey_completed` is never touched.

---

## 0. Preflight

Read `docs/reports/M03_B1_CHECKPOINT.md`, `packages/sheet-schema/src/tabs/localization-media.ts` (`10_ASSETS` schema), `packages/test-fixtures/src/good-workbook.ts` (confirmed `'map'` is an already-accepted `location` controlled-list value), `apps/functions/src/services/access-config-seed.service.ts` (the existing idempotent-seed pattern this item reuses), and `apps/functions/src/services/content-runtime.service.ts`/`media-asset.service.ts` (confirmed the poster-variant mechanism built in M03-B1 is the correct place for the ocean poster, rather than a third asset row).

## 1. Design decision: two asset rows, not three

`map_ocean_loop` registers the ocean poster as its own `poster_drive_file_id`, reusing the M03-B1 media gateway's existing `variant=poster` resolution (§3a of the M03-B1 checkpoint: "a poster is always validated as an image, regardless of the asset's own family") instead of creating a redundant third `10_ASSETS` row. This is the schema's intended use of that column and avoids inventing a new asset relationship.

`location_id: 'map'` is used for both rows — already an accepted controlled-list value (confirmed in the live Sheet's `39_VALIDATION_LISTS` before writing, see §3) reserved for map-only assets, distinct from the eye-level per-location assets the Living Bible describes for actual Beach/Church/etc. scenes. The Living Bible explicitly distinguishes "island uses real ocean video behind/around it" (map-level) from the Beach's own eye-level ocean (§8A, §18A) — `map_ocean_loop`'s notes field records this distinction directly in the Sheet so a future author does not confuse the two.

## 2. Files changed / created

**New (backend, `apps/functions`):**

- `src/services/phase1-map-assets-seed.service.ts` — `MAP_ASSET_SEED_ROWS` spec + `seedPhase1MapAssets(gateway)`, an idempotent upsert mirroring `access-config-seed.service.ts`'s pattern exactly (only the fields this seed owns are ever patched; unknown columns and any other row are preserved untouched; a version bump is intentionally not forced on a routine re-run, since that would invalidate every already-cached client URL for no reason).

**New (scripts, live/manual only, excluded from `npm run test`):**

- `scripts/preflight-phase1-map-assets.mjs` (`npm run preflight:phase1:map-assets`) — read-only Drive metadata + root-containment check for all three files, before any Sheet write.
- `scripts/seed-phase1-map-assets.mjs` (`npm run seed:phase1:map-assets`) — thin CLI wrapper around the tested seed function.

**Modified:**

- `package.json` — adds the two scripts above.

**New (frontend, `apps/web`):**

- `src/features/map-preview/MapCompositionPreview.tsx` + `.module.css` — the developer-only preview (§5 below).

**Modified (frontend):**

- `src/features/gate/GatePage.tsx` — adds `<MapCompositionPreview />` alongside the existing `<ContentRuntimeLab />` in the authenticated-owner branch. No Gate/session/logout logic touched.
- `tests/helpers/mockApi.ts` — adds `map_island_transparent`/`map_ocean_loop` to `SAMPLE_CONTENT_RUNTIME_RESPONSE.assets` so both the new component and any future test can exercise the real registered-asset shape.

**New (backend tests):**

- `apps/functions/tests/phase1-map-assets-seed.service.test.ts` (9 tests).

**New (frontend tests):**

- `apps/web/tests/MapCompositionPreview.test.tsx` (8 tests): loading state; developer-only banner always present; composed video+image rendering with correct `mediaRef`/poster query param/loop/muted; asset-status reporting; **no raw Drive file ID anywhere in rendered markup**; missing-asset messaging (both assets missing, and only one missing) pointing at the seed script; offline/retry.

**Not committed.**

## 3. Live verification performed (real Sheet/Drive, real credential present in this environment)

Per the instruction ("Inspect headers, enabled state, versions, root containment and access first... Use metadata, HEAD and small range requests first; avoid unnecessary full downloads"):

```text
npm run preflight:phase1:map-assets

Asset root: 1JsF…wfnq (masked)

=== map_island_transparent (drive_file_id) [1NR4…vKO8] ===
    PASS  Metadata call succeeds
    PASS  Not trashed
    PASS  MIME type is an allowed "image" type
    PASS  Size is known
    PASS  Contained under the configured asset root

=== map_ocean_loop (drive_file_id) [1nPe…L5oo] ===
    PASS  Metadata call succeeds
    PASS  Not trashed
    PASS  MIME type is an allowed "video" type
    PASS  Size is known
    PASS  Contained under the configured asset root

=== map_ocean_loop (poster_drive_file_id) [1de1…erMt] ===
    PASS  Metadata call succeeds
    PASS  Not trashed
    PASS  MIME type is an allowed "image" type
    PASS  Size is known
    PASS  Contained under the configured asset root

Summary: 15 passed, 0 failed
```

Only after every check passed was the seed run:

```text
npm run seed:phase1:map-assets
=== Upserting 10_ASSETS map-composition rows ===
  CREATED  10_ASSETS.map_island_transparent
  CREATED  10_ASSETS.map_ocean_loop
created: 2, updated: 0, unchanged: 0

npm run seed:phase1:map-assets   (rerun, proving idempotency against the real Sheet)
=== Upserting 10_ASSETS map-composition rows ===
  UNCHANGED  10_ASSETS.map_island_transparent
  UNCHANGED  10_ASSETS.map_ocean_loop
created: 0, updated: 0, unchanged: 2
```

A direct `computeSchemaHealth()` read against the live Sheet after the seed confirmed **zero new diagnostics reference either new row** (`map_island_transparent`/`map_ocean_loop` produce no `INVALID_CONTROLLED_VALUE`, no PK-duplicate, no placeholder warning) — the pre-existing live error/warning counts (unrelated historical `05_ENTRY_LOGS` data, tracked separately, see the M03-B1 checkpoint and Phase 1 item A) were unchanged in composition by this write.

No Drive file was downloaded (metadata-only calls). No credential, folder ID, or unmasked file ID was printed. `02_USERS` (Gate code / Admin password) was never read or written by either script (proven for the seed function in the unit tests, §4).

## 4. Test coverage

`phase1-map-assets-seed.service.test.ts` (9 tests, fake-Sheet-client, no network): creates both rows from empty; correct `asset_type`/`location_id`/`drive_file_id` for the island; correct video type + poster wiring for the ocean loop; idempotent rerun reports everything unchanged; never creates a duplicate row across repeated runs; preserves every pre-existing `10_ASSETS` row byte-for-byte; a drifted row (manually corrupted `drive_file_id`/`enabled`) is corrected back without duplicating; version is not bumped on a routine unrelated re-run; never touches `02_USERS`.

`MapCompositionPreview.test.tsx` (8 tests, mocked fetch, no network): see §2 above for the full list; notably includes a dedicated test asserting none of the three real Drive file IDs supplied for this milestone ever appear in the rendered DOM.

## 5. The developer-only preview

`MapCompositionPreview` sits directly below `ContentRuntimeLab` in the same owner-session-gated branch of `GatePage.tsx` (i.e. only reachable after a real Gate login — never public). It:

- Fetches `/api/content/runtime` (already returns both new assets' `mediaRef`/`hasPosterVariant`/`version` once seeded — no backend change was needed for this, since `buildAssetStatuses()` already exposes every `10_ASSETS` row generically).
- Renders the looping ocean video (`<video loop muted autoPlay playsInline>`, `src`/`poster` both same-origin `/api/media/...` paths, never a Drive file ID) with the transparent island image absolutely positioned above it.
- Shows a persistent, unmissable "DEVELOPER PREVIEW ONLY — not the real Map" banner (`role="note"`), and a clear "run `npm run seed:phase1:map-assets`" hint if either asset is not yet registered (so the screen never silently looks broken before the live seed has run).
- Reads nothing from and writes nothing to any player-progress/story-state tab — no `first_journey_completed` or any other progress field is referenced anywhere in this component.

## 6. Commands run and results (final, after both items A and B)

```text
npm run format         → PASS (formatting-only diffs auto-applied to touched files)
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 492/492 across 45 files (46 sheet-schema + 305 functions + 141 web)
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
```

`npm run test:e2e` was not run live in this session (no `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD` set in this environment, same credential-gating already documented in every prior milestone's evidence — those tests skip rather than fail). No new Playwright spec was added in this item since the new UI is exercised behind the same owner-authenticated branch the existing `content-runtime-lab.spec.ts`/`gate.spec.ts` already cover live once credentials are available; adding a dedicated live spec for `MapCompositionPreview` is a reasonable follow-up but not required to prove this item's behavior, which the unit/component tests already cover deterministically.

No `firebase deploy` was run.

## 7. Known limitations

- The two new assets are registered but no production-quality art direction pass has been made on their crop/composition beyond what `object-fit: cover`/`contain` provide — this is explicitly a **developer preview**, not a finished Map screen (M14/Phase 2 will build the real living Map).
- No dedicated live Playwright spec exists yet for `MapCompositionPreview` (see §6) — deferred, not blocking.
- `10_ASSETS.asset_type` remains a free-text column (unchanged from M01/M03-B1) — a future schema-health improvement could add it to a controlled list, but that is out of this item's scope.

## 8. Confirmations

- Only Phase 1 item B was implemented in this section. No M04+ (D/E/F/G) work, and no part of the real living Map (M14), was started.
- The Map remains locked to a new player; `first_journey_completed` was not read or written anywhere in this item.
- No content, gameplay, religious copy, or art decision was invented — the three Drive file IDs used are exactly the ones Ahmed supplied directly in the current instruction.
- Nothing was committed, merged, pushed, or deployed. The only live mutation performed was the explicitly-instructed, idempotent `10_ASSETS` upsert (§3), preceded by a read-only preflight.

## 9. Addendum — review findings and fixes (2026-09-16, same day)

Ahmed reviewed this checkpoint and raised three concrete concerns before Phase 1 continued. All three were investigated and, where a real gap existed, fixed with evidence — not just re-asserted.

### 9.1 Test-count reconciliation (464 → 492 = +28, not +26)

The original summary said "26 new tests," counting only the tests explicitly authored (`entry-log.service.test.ts` 9 + `phase1-map-assets-seed.service.test.ts` 9 + `MapCompositionPreview.test.tsx` 8 = 26). The other 2 were not a miscount or double-counted test — they come from `apps/web/tests/import-boundary.test.ts`, which dynamically generates one `it.each` test per file under `apps/web/src` (a private-credential import-boundary scan, unchanged logic since M00). Adding `MapCompositionPreview.tsx` and `MapCompositionPreview.module.css` under `apps/web/src` automatically grew that suite from 49 to 51 generated cases. Verified directly by stashing all session changes, confirming the exact baseline (`46 + 287 + 131 = 464` across `4 + 26 + 12 = 42` files, matching the M03-B1 checkpoint exactly), then unstashing and re-diffing per file: functions `287→305` (+18 = the two new authored files), web `131→141` (+10 = 8 authored + 2 auto-generated by `import-boundary.test.ts`). `46+305+141 = 492`. No error, no duplication — just an incomplete summary the first time.

### 9.2 The developer preview was not actually development-only — found and fixed

This was a real, valid finding. As shipped in §5 above, `MapCompositionPreview` was gated only by an owner (Gate) session and its own on-screen "developer preview" label — any real Veoulla who completed the Gate could load it, in any deployed environment, including a real production deployment. An owner session and UI copy are not an access boundary.

**Fix — a genuine server-side development-environment boundary, not a frontend flag:**

- New `apps/functions/src/api/development-only-middleware.ts`: `createDevelopmentOnlyMiddleware(isDevelopmentEnvironment)` responds with the exact same generic 404 body the app's catch-all not-found handler already uses, for any environment that isn't development — checked **before** owner authentication, so a production/staging request gets an indistinguishable 404 regardless of session state.
- New `apps/functions/src/api/dev-map-preview.ts`: `GET /api/dev/map-preview-assets`, a dedicated, minimal endpoint (reads only the two known map-asset rows, never the full `10_ASSETS` tab) — registered in `app.ts` behind `requireDevelopmentEnvironment` **then** `requireOwner`.
- `app.ts` gained a `getEnvironment` seam (defaults to the real `resolveEnvironment()`, already used elsewhere for the `isProduction` cookie flag) and `isDevelopmentEnvironment = () => env === 'local' || env === 'emulator'`. **`staging` is deliberately excluded** — a developer-only preview must not leak onto any shared/deployed environment a reviewer or player could reach, only the real local dev server or the Firebase emulator.
- New contract `packages/contracts/src/dev-map-preview.ts` (`DevMapPreviewResponse`, reusing the existing `RuntimeAssetStatus` shape rather than inventing a parallel one).
- Frontend: `apps/web/src/services/devMapPreviewClient.ts` calls the new dedicated route instead of the general-purpose `/api/content/runtime`; `MapCompositionPreview.tsx` now renders a clear "only available when running against a local or emulator development backend" message (never composed media) whenever the backend's response is that development-only 404 — distinguished from a genuine network/offline failure by checking for the exact catch-all message text, so the UI cannot confuse "disabled by design" with "broken."
- `mockApi.ts`'s default mock for `/api/dev/map-preview-assets` **is now the real non-development 404 shape** — a test must explicitly opt into "this looks like a local/emulator backend," matching the server's own default-deny posture, rather than success being the default.

**Live proof, not just unit tests:**

```text
$ NODE_ENV=production node -e "... fetch('/api/dev/map-preview-assets') ..."
NODE_ENV=production -> status: 404 body: {"ok":false,"code":"not_found","message":"No route for GET /api/dev/map-preview-assets"}
reported environment field: production
```

This runs the real compiled `createApp()` under a genuine `NODE_ENV=production` process (no injected test double at all — the exact mechanism a real Firebase Functions production deployment sets) and confirms the route is unreachable. `apps/functions/tests/dev-map-preview-api.test.ts` (12 new tests) additionally covers: 404 in `production` (both without and with a valid owner session — proving the environment check runs first), 404 in `staging`, byte-identical 404 shape to an actual unknown route, 401/403 auth isolation still enforced in `local`/`emulator`, correct payload shape once seeded, graceful empty/disabled-asset handling, and no raw Drive ID leakage. `apps/web/tests/MapCompositionPreview.test.tsx` was rewritten (10 tests) so its default mock is the real 404 shape, with dedicated cases for the "not available" UI state versus a genuine offline/retry state.

**The real living Map's own lock is untouched and was never the mechanism in question** — this addendum only concerns the Phase 1 developer preview screen; `first_journey_completed`/M14 gating are separate and were not touched here or before.

### 9.3 Browser/Playwright verification: what was and wasn't actually performed

**Honest accounting, as asked:** the original Phase 1 A/B checkpoints performed (a) live Node-level Google Drive **metadata** verification (`preflight-phase1-map-assets.mjs` — reachability, MIME type, not-trashed, root containment; no bytes downloaded) and (b) jsdom-based component tests (Vitest + Testing Library) asserting DOM attribute values (e.g. `video.src` contains the expected URL string). **Neither of those proves a real browser can actually fetch, decode, and render the media** — jsdom does not perform real network fetches or media decoding at all; it is a DOM simulation. No credential-gated Playwright spec was run against the real Gate-authenticated UI, because `E2E_GATE_CODE` is not set in this environment and this project's standing rule (stated in every M01–M03-B1 checkpoint) is that Ahmed's real Gate code must never be read, guessed, or used by Claude — including reading it directly from the Sheet via the service account's own credential, which would technically be possible but defeats the purpose of keeping it out of this session.

**What was run now to close that gap, without touching the real Gate code:** a new script, `scripts/verify-phase1-map-media-browser.mjs` (`npm run verify:phase1:map-media-browser`), that:

1. Mints one real, idempotent owner session row directly via `createOrReconcileSession` — the same primitive the Gate-login handler calls internally _after_ a correct code is verified, never the code-verification path itself, and never Ahmed's real digits.
2. Starts a real local Express server from the actual `createApp()`, using the real Google Sheets/Drive credential already present in this environment (not a fake client).
3. Launches a real headless Chromium (Playwright) and loads a same-origin HTML harness with a real `<img>` pointed at `/api/media/map_island_transparent` and a real `<video>` pointed at `/api/media/map_ocean_loop`.
4. Asserts genuine rendering, not string checks: `naturalWidth > 0` (the browser actually decoded the image), `readyState >= 1` and `videoWidth/videoHeight > 0` (the browser actually loaded playable video metadata with real dimensions).
5. Issues a real browser-side `fetch()` with a `Range: bytes=0-999` header against the video and asserts a genuine `206` with a correct `Content-Range`/`Content-Length` — proving byte-range streaming works from an actual browser network stack, not only Node's `supertest`.

```text
Owner session minted: sess_g…tion (masked, real Gate code never touched)
=== Real browser image rendering (map_island_transparent) ===
  PASS  Browser decoded the image (naturalWidth > 0)
=== Real browser video metadata (map_ocean_loop) ===
  PASS  Browser loaded playable video metadata (readyState >= 1)
  PASS  Video has real decoded dimensions
=== Real browser byte-range fetch (map_ocean_loop) ===
  PASS  Real browser Range request returns 206
  PASS  Content-Range header is present and well-formed
  PASS  Content-Length matches the requested 1000-byte range
Summary: 6 passed, 0 failed
```

**What remains genuinely unverified, and why:** the actual `MapCompositionPreview` React component, rendered inside the real app shell behind the real Gate-authenticated UI flow, in a real (non-jsdom) browser. This specific path is still blocked by the same standing credential rule above — it requires either `E2E_GATE_CODE` (Ahmed's to provide, at his discretion, exactly as every prior milestone's evidence has stated) or reading the real Gate code, which this session will not do unprompted. The script above proves the backend genuinely serves renderable, byte-range-correct media to a real browser, and the jsdom component tests prove the React wiring produces the correct URLs/attributes — the one remaining gap is purely "does the real Gate-authenticated page, as opposed to a synthetic harness page, render the same way," which is a credential-gated question, not an open engineering question.

### 9.4 Updated file list, test totals, and commands (supersedes §2/§4/§6 above for the current state)

**Additional files from this addendum:**

- New: `apps/functions/src/api/development-only-middleware.ts`, `apps/functions/src/api/dev-map-preview.ts`, `apps/functions/tests/dev-map-preview-api.test.ts`, `packages/contracts/src/dev-map-preview.ts`, `apps/web/src/services/devMapPreviewClient.ts`, `scripts/verify-phase1-map-media-browser.mjs`.
- Modified: `apps/functions/src/app.ts` (new `getEnvironment` seam + the two new routes), `packages/contracts/src/index.ts` (new export), `apps/web/src/features/map-preview/MapCompositionPreview.tsx` (now calls the dedicated dev-only endpoint and handles its 404 distinctly), `apps/web/tests/MapCompositionPreview.test.tsx` (rewritten, 10 tests), `apps/web/tests/helpers/mockApi.ts` (default-deny mock for the new route), `package.json` (new `verify:phase1:map-media-browser` script).

**Final test totals:** **507 unit/integration tests, 46 files, all passing** (46 sheet-schema + 317 functions + 144 web).

**Final commands run:**

```text
npm run format         → PASS
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 507/507 across 46 files
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run verify:phase1:map-media-browser → PASSED, 6/6, real Chromium, no credential/session ID/Drive ID printed
NODE_ENV=production ad hoc check        → confirmed real 404 for the dev-only route (§9.2)
```

No commit, merge, push, or deploy was performed in this addendum either.
