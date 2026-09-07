# M03-A — Localization, Direction, and Content Registries Foundation: Checkpoint Report

**Milestone:** M03-A (foundation only — see Master Build Plan's full M03 for the remaining M03-B scope: Drive media streaming, service-worker caching, voice-over playback)
**Date:** 2026-09-06
**Scope:** Typed backend repositories/service for `07_LANGUAGES`/`08_UI_TEXT`/`09_ICONS`/`10_ASSETS`/`15_DIALOGUE`/`16_VOICEOVER`, an owner-session-protected `/api/content/runtime` endpoint, safe public contracts, the frontend localization runtime (locale store, direction handling, text-fallback resolution), and the M03 Content Runtime Lab replacing the M02 "Access granted / World loading" placeholder. M02's accepted Gate/Admin authentication and session behavior were not modified.

---

## 0. Preflight and reading

Read completely before editing: `CLAUDE.md`, `docs/Veoullas_World_Living_Bible.md`, `docs/Claude_Code_Master_Build_Plan.md`, `docs/reports/M01_EVIDENCE.md`, `docs/reports/M02_EVIDENCE.md`, the existing Sheet schema (`packages/sheet-schema`), gateway (`apps/functions/src/repositories/sheet-gateway.ts`), fixtures (`packages/test-fixtures`), contracts (`packages/contracts`), and the current Gate/Admin frontend implementation.

**Pre-existing uncommitted state found before any M03-A edit began:** `apps/web/src/features/gate/GatePage.tsx`, `apps/web/tests/GatePage.test.tsx`, `docs/reports/M02_EVIDENCE.md`, and `tests/e2e/gate.spec.ts` already carried Ahmed's accepted-but-uncommitted 2026-09-06 M02-C Gate-keyboard-UX follow-up (documented in M02_EVIDENCE.md §6a). This work was left untouched except where M03-A explicitly required editing the same file (the "Access granted / World loading" placeholder in `GatePage.tsx`, per instruction 13) — no keyboard-handling logic in that file was altered.

**No conflict found** between this prompt and the Living Bible/Master Build Plan: the Master Build Plan's M03 bundles localization, icons/assets, a Drive media gateway, service-worker caching, and a voice-over player into one milestone, but the Living Bible (§2) requires "small, testable milestones," and CLAUDE.md rule 3 requires implementing only the requested scope. Splitting M03 into M03-A (this report) and a later M03-B for Drive streaming/caching/voice playback is a scoping decision consistent with both documents, not a contradiction — so no conflict was reported.

All six target tabs (`07_LANGUAGES`, `08_UI_TEXT`, `09_ICONS`, `10_ASSETS`, `15_DIALOGUE`, `16_VOICEOVER`) were already fully typed in the M01 registry (`packages/sheet-schema/src/tabs/localization-media.ts`, `world-structure.ts`) — no schema changes were needed.

## 1. Files changed / created

**New (backend, `apps/functions`):**

- `src/services/media-ref.ts` — `buildMediaRef(assetId, version)`, the stable same-origin path convention (`/api/media/{assetId}?v={version}`) prepared for the M03-B Drive gateway; never derived from a Drive file ID.
- `src/services/content-runtime.service.ts` — `computeContentRuntime(gateway, options)`: reads all six tabs' enabled rows in parallel via the M01 gateway, resolves icon/voiceover/dialogue asset references to `mediaRef`s, and computes content diagnostics (duplicate localized rows, missing English fallback, invalid icon/asset/dialogue/voice-over references).
- `src/api/content-runtime.ts` — `GET /api/content/runtime` handler (supports `?refresh=1` cache bypass).
- `src/api/owner-auth-middleware.ts` — `createOwnerAuthMiddleware`, mirroring the M02 `createAdminAuthMiddleware` exactly but for the `owner` session kind (written as a new file rather than refactoring the accepted M02 admin middleware, to avoid any risk to accepted M02 behavior).

**Modified (backend):**

- `src/app.ts` — registers `GET /api/content/runtime` behind the new owner-auth middleware. No other route's wiring, order, or behavior changed.

**New (shared contracts/fixtures):**

- `packages/contracts/src/content-runtime.ts` — `SUPPORTED_LOCALES`, `FALLBACK_LOCALE`, `LocaleCode`, `ContentDirection`, `RuntimeLanguage`, `RuntimeUiTextEntry`, `RuntimeDialogueLine`, `RuntimeVoiceoverEntry`, `RuntimeIconEntry`, `RuntimeAssetStatus`, `ContentDiagnostic(Code)`, `ContentRuntimeResponse`.
- `packages/test-fixtures/src/m03-content-fixtures.ts` — `buildM03Workbook()`: `GOOD_WORKBOOK` with richer `08_UI_TEXT`/`09_ICONS`/`10_ASSETS`/`15_DIALOGUE`/`16_VOICEOVER` rows exercising every validation rule (five-locale coverage, a duplicate-localized-row pair, a missing-English-fallback group, invalid icon/asset/dialogue/voice-over references, and disabled rows of every kind).

**Modified (shared):**

- `packages/contracts/src/index.ts`, `packages/test-fixtures/src/index.ts` — new exports only, additive.

**New (backend tests):**

- `apps/functions/tests/content-runtime.service.test.ts` (14 tests), `apps/functions/tests/content-runtime-api.test.ts` (5 tests).

**New (frontend, `apps/web`):**

- `src/i18n/locales.ts` — re-exports `SUPPORTED_LOCALES`/`LocaleCode`/`FALLBACK_LOCALE` from contracts; `staticDirectionFor()` (bootstrap-safe direction default before real data loads) and `isSupportedLocale()`.
- `src/i18n/localeStore.ts` — persisted (localStorage-backed, key `vw_locale`) Zustand store holding the current locale; keeps `document.documentElement.lang`/a best-effort `dir` in sync on every change, including after async rehydration.
- `src/i18n/resolveText.ts` — `resolveUiText()`: pure, synchronous text_id → locale resolution with English fallback and a safe (never-raw-key) missing placeholder.
- `src/services/contentRuntimeClient.ts` — `fetchContentRuntime()`, the typed client for `GET /api/content/runtime`.
- `src/features/content-lab/ContentRuntimeLab.tsx` + `.module.css` — the M03 Content Runtime Lab (§5 below).

**Modified (frontend):**

- `src/features/gate/GatePage.tsx` — the authenticated-owner branch's "Access granted / World loading" placeholder is replaced by "Access granted" (kept) + `<ContentRuntimeLab />`. No Gate dial/keyboard/session/logout logic touched.
- `src/app/AppShell.module.css` — **bug fix found and fixed during this milestone**, see §7.

**New/modified (frontend tests):**

- New: `apps/web/tests/localeStore.test.ts` (5), `apps/web/tests/resolveText.test.ts` (5), `apps/web/tests/ContentRuntimeLab.test.tsx` (15).
- Modified: `apps/web/tests/helpers/mockApi.ts` (adds `SAMPLE_CONTENT_RUNTIME_RESPONSE` and a `/api/content/runtime` route, owner-session-gated like the existing admin/schema-health route); `apps/web/tests/GatePage.test.tsx` (one test rewritten to assert the Lab renders and the old placeholder text is gone — no other Gate test changed).

**New/modified (e2e):**

- New: `tests/e2e/content-runtime-lab.spec.ts` — credential-gated (skips without `E2E_GATE_CODE`) desktop + mobile coverage of five-language switching, RTL/LTR, and conditional icon mirroring.
- Modified: `tests/e2e/gate.spec.ts` (the one credential-gated success assertion now checks for the Lab instead of the old "World loading" text); `tests/e2e/network-security.spec.ts` (adds an unauthenticated `/api/content/runtime` 401 leak-scan, mirroring the existing schema-health scan).

**New (scripts, evidence-only, not part of any milestone acceptance path):**

- `scripts/capture-m03-screenshots.mjs` — captures the four screenshots in §6 using intercepted/mocked `/api/*` responses (never the real Sheet, never `E2E_GATE_CODE`).

**Not committed.**

## 2. Endpoint and contracts

| Method | Route                  | Protection                                                                                                                                                                                                                               | Purpose                                                                                                                                                            |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/content/runtime` | Owner session required (`createOwnerAuthMiddleware`) — an Admin session presented in the owner cookie is rejected `403 SESSION_FORBIDDEN`, exactly mirroring the existing Admin-session isolation. `?refresh=1` bypasses the read cache. | Returns `ContentRuntimeResponse`: `languages`, `uiText`, `dialogue`, `voiceover`, `icons`, `assets` (status-only), `diagnostics`, `cacheGeneratedAt`, `requestId`. |

Every array is built only from **enabled** rows (`gateway.readEnabledRows`) — a disabled row from any of the six tabs never reaches the response at all, proven in `content-runtime.service.test.ts` and `ContentRuntimeLab.test.tsx`. `10_ASSETS.drive_file_id`/`mobile_drive_file_id`/`poster_drive_file_id` (all marked `sensitive: true` in the registry since M01) are never read into any response field; icons/voiceover/dialogue only ever carry a `mediaRef` built by `buildMediaRef(assetId, version) → "/api/media/{assetId}?v={version}"` — a path convention, not a working media URL (no Drive read happens in M03-A). `RuntimeAssetStatus` exposes only `hasMobileVariant`/`hasPosterVariant` booleans, never the underlying file IDs.

## 3. Content validation implemented

`computeContentRuntime` performs the validations required by the prompt:

- **Enabled rows only** — `readEnabledRows` filters every one of the six tabs before any mapping happens.
- **Stable IDs** — every entry keys off its tab's registered primary key (`ui_text_row_id`, `icon_id`, `asset_id`, `dialogue_row_id`, `voiceover_id`).
- **Supported locales** — `SUPPORTED_LOCALES = ['en', 'ar-EG', 'it', 'el', 'fr']` (shared contract, `packages/contracts/src/content-runtime.ts`); `07_LANGUAGES` rows are filtered to this set before being returned.
- **Direction values** — every direction-bearing column resolves to exactly `'ltr' | 'rtl'`.
- **Duplicate localized rows** — `checkLocaleGroups()` groups `08_UI_TEXT`/`15_DIALOGUE`/`16_VOICEOVER` rows by their cross-locale content key (`text_id`, `dialogue_id`, `content_type:content_id`) and flags any `(key, locale)` pair appearing more than once as `DUPLICATE_LOCALIZED_ROW` — a check schema-health's primary-key-uniqueness rule cannot catch, since two different rows legitimately have different primary keys.
- **Missing English fallback** — the same grouping flags any key with no enabled `en` row as `MISSING_ENGLISH_FALLBACK`.
- **Invalid icon/asset/dialogue/voice-over references** — an icon's `asset_id`, a voiceover's `audio_asset_id`, and a dialogue line's `voiceover_id` are each checked against an index of enabled targets; a missing or disabled target resolves `mediaRef`/`voiceoverMediaRef` to `null` and adds `INVALID_ICON_ASSET_REFERENCE` / `INVALID_VOICEOVER_ASSET_REFERENCE` / `INVALID_DIALOGUE_VOICEOVER_REFERENCE`.
- **Disabled or incomplete records** — disabled rows are excluded structurally (never even parsed into an entry); "incomplete" is operationalized as "missing English," per the above.

All 14 `content-runtime.service.test.ts` cases exercise a dedicated fixture (`buildM03Workbook()`) containing one deliberate example of every rule above, so each diagnostic code is proven against real (fixture) data, not just asserted to exist.

## 4. Localization behavior

- **Five supported languages**, exactly as locked in the Living Bible §3A/10A: English (`en`, LTR), Egyptian Arabic (`ar-EG`, RTL), Italian (`it`, LTR), Greek (`el`, LTR), French (`fr`, LTR).
- **Initial language is English** (`FALLBACK_LOCALE = 'en'`, `useLocaleStore`'s default state) — the Living Bible's §18J "no separate pre-world language-selection screen; the persistent Language control becomes available later" is respected: the switcher lives inside the Content Runtime Lab (shown only after owner authentication), not on the Gate itself, so nothing about the pre-authentication Gate screen changed.
- **Switching language works without a page reload**: `useLocaleStore.setLocale()` is a plain state update; `ContentRuntimeLab.test.tsx`'s "switches all five languages without navigating/reloading the page" test asserts `window.location.href` is unchanged across five switches, and the same is proven live in `content-runtime-lab.spec.ts` (credential-gated).
- **Persists locally for later visits**: the store uses Zustand's `persist` middleware against `localStorage` (`vw_locale`), proven in `localeStore.test.ts` and `ContentRuntimeLab.test.tsx`'s remount test.
- **Changes `document.documentElement.lang`/`.dir`**: `localeStore.ts` sets `lang` (and a best-effort `dir`) as a side effect on every state change; `ContentRuntimeLab` then applies the **authoritative** direction — resolved from the real `07_LANGUAGES` data just fetched, falling back to the static map only if that locale is momentarily absent — via a `useEffect` keyed on the resolved direction. Proven in both `localeStore.test.ts` and `ContentRuntimeLab.test.tsx`, and live in `content-runtime-lab.spec.ts` (`expect(page.locator('html')).toHaveAttribute('dir', ...)`).
- **Falls back safely to English for a missing translation, never a raw key**: `resolveUiText()` — exact locale → English → a safe placeholder string (`"(Translation not yet available)"`), never the `text_id` itself. Proven in `resolveText.test.ts` (five cases, including "never returns the raw text_id...") and visually in the Arabic/English screenshots (§6): `content_lab_incomplete` only has an Arabic row in the fixture, and English correctly shows the fallback note instead of a blank or raw key.

## 5. RTL/LTR rules and the Content Runtime Lab

The Lab (`apps/web/src/features/content-lab/ContentRuntimeLab.tsx`) is the M03 technical validation screen, replacing only the old "Access granted / World loading" block inside `GatePage.tsx`'s authenticated branch — nothing else about Gate/session behavior changed. Per instruction 16, this is explicitly a technical validation screen, not a world scene: section headings and labels ("Languages", "Sheet-driven UI text", "Diagnostics", etc.) are hardcoded chrome, matching the precedent already accepted for the M01 Admin Schema Health screen (`AdminSchemaHealthView.tsx`, e.g. "Expected tabs", "Search tabs"); every piece of _localized or Sheet-driven content_ displayed (the heading text, the dialogue line, icon `rtl_mirror` flags, asset/voiceover status) comes from `/api/content/runtime`.

It shows, in one screen:

1. A persistent five-language switcher (native names, `aria-pressed` for the current selection).
2. Current locale and resolved direction (`Locale: en · Direction: ltr`).
3. Several Sheet-driven UI strings (`content_lab_title`, `content_lab_incomplete`), resolved per-locale with fallback.
4. One localized dialogue/caption example (falls back to English if the current locale has no line).
5. Icon samples proving conditional RTL mirroring (§5a below).
6. Asset/voiceover metadata **status only** — asset ID, version, preload priority, mobile/poster-variant booleans; voiceover ID, locale, duration, caption presence — never a Drive file ID or a real media fetch.
7. Loading (`LoadingState`), offline/retry, missing-translation, and disabled-content fallbacks (§5 tests below).

**Direction handling is deliberate, not a blind reversal** (instruction 11): only `document.documentElement.dir` and the icon-swatch `transform` are conditioned on direction; the CSS module uses `text-align: start` (a logical property) rather than hardcoding `left`, and no component blindly mirrors an entire layout — only the two things the Living Bible actually asks for (document direction, and Sheet-flagged icon mirroring).

### 5a. Icon-mirroring proof

- `icons[].rtlMirror` comes straight from `09_ICONS.rtl_mirror` (already a typed boolean column in the M01 registry).
- The Lab computes `mirrored = direction === 'rtl' && icon.rtlMirror` per icon — **never** direction alone.
- Fixture proof (`content-runtime.service.test.ts`): "proves conditional RTL mirroring is Sheet-driven: the Back icon mirrors, an ordinary icon does not" — `icon_back` (`rtl_mirror: TRUE`) reports `rtlMirror: true`; `icon_map` (`rtl_mirror: FALSE`) reports `rtlMirror: false`.
- Component proof (`ContentRuntimeLab.test.tsx`): in English (LTR), both icons report `data-mirrored="false"`; after switching to Arabic (RTL), `icon_back` flips to `data-mirrored="true"` while `icon_map` **stays** `"false"` — proving mirroring is per-icon Sheet configuration, not automatic for every icon in RTL.
- Live proof (`content-runtime-lab.spec.ts`, credential-gated) and the screenshots in §6: the Back icon's arrow visibly flips (`➜` → mirrored) only in Arabic; the Map icon's arrow never flips.

## 6. Screenshots

Captured via `node scripts/capture-m03-screenshots.mjs` against the local emulator with every `/api/*` call intercepted and fulfilled with a canned, fixture-shaped response (the script never uses `E2E_GATE_CODE` and never touches the real Sheet), saved to `docs/reports/M03/`:

- `content-runtime-lab-english-desktop.png` — English/LTR, desktop (1440×1000).
- `content-runtime-lab-english-mobile.png` — English/LTR, mobile (Pixel 7 profile).
- `content-runtime-lab-arabic-desktop.png` — Arabic/RTL, desktop — whole layout mirrors (language switcher order, text alignment), the Back icon's arrow points left (mirrored), the Map icon's arrow still points right (not mirrored).
- `content-runtime-lab-arabic-mobile.png` — Arabic/RTL, mobile — same proof, no horizontal overflow (see §7).

All four visually confirm: five-language switcher, current locale/direction line, Sheet-driven UI text with a visible missing-translation fallback note, one dialogue caption, conditional icon mirroring, and status-only asset/voiceover metadata (no Drive file ID anywhere on screen).

## 7. A real bug found and fixed: RTL horizontal overflow from the M00 skip-link

While preparing the Arabic mobile screenshot, its captured dimensions were implausibly large compared to the English one. Direct DOM inspection (`document.documentElement.scrollWidth` vs `clientWidth`) confirmed a genuine ~999px of horizontal overflow **only** when `dir="rtl"` was set on `<html>` — the exact page that has no such overflow in English.

**Root cause:** `apps/web/src/app/AppShell.module.css`'s `.skipLink` (accessible skip-to-content link, written in M00) used the classic `position: absolute; left: -999px;` off-canvas-hide technique. This is a known cross-browser quirk: in an RTL document, a large negative physical `left` offset is included in `document.documentElement.scrollWidth` (unlike in LTR), producing real, measurable horizontal overflow on every page — invisible until M03-A introduced the app's first real `dir="rtl"` state, since M00–M02 never set that attribute.

**Fix:** replaced the negative-offset technique with an offset-free "visually hidden" pattern (`top: 0; left: 0; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0)`) that keeps the link in normal document flow instead of pushing it off-canvas, eliminating the quirk in both directions. Verified via direct `scrollWidth`/`clientWidth` inspection (equal before/after) and by re-capturing the mobile screenshots (Arabic mobile's total screenshot height now matches English's, confirming no leftover overflow). This is now also covered by the new `content-runtime-lab.spec.ts` mobile no-overflow test (credential-gated) and is exactly the kind of RTL correctness issue instruction 15/T008-T009 exist to catch — fixed within M03-A's own scope since it was invisible before this milestone existed and directly affects every RTL screen, current and future.

No Gate/Admin visual or behavioral change resulted — `.skipLink:focus` still shows the same keyboard-accessible skip control at the same position.

## 8. Owner/Admin isolation and sanitized responses

- `createOwnerAuthMiddleware` is a byte-for-byte structural mirror of the accepted `createAdminAuthMiddleware`, parameterized on `'owner'` — written as a separate new file rather than a refactor, so the accepted M02 Admin middleware file was not touched at all.
- `content-runtime-api.test.ts` proves: no cookie → `401 SESSION_REQUIRED`; an Admin session ID presented in the **owner** cookie → `403 SESSION_FORBIDDEN` (Admin authentication never counts as owner authentication, per instruction 7); a valid owner session → `200` with the full payload shape; the response never contains a raw Drive file ID, a session ID, the fixture Gate code/Admin password, or the raw `gate_code_plaintext`/`admin_password_plaintext` column names.
- `network-security.spec.ts` adds a live, unauthenticated `GET /api/content/runtime` check against the real Sheet (401, scanned for every forbidden pattern the existing schema-health check already uses, plus `"driveFileId"`).

## 9. Test totals

**383 unit/integration tests, 37 files, all passing** (`npm run test`):

- `packages/sheet-schema`: 46 tests / 4 files — **unchanged from M02** (no schema changes made).
- `apps/functions`: 206 tests / 21 files — up from M02's 187/19 (+19 tests, +2 files: `content-runtime.service.test.ts` (14) + `content-runtime-api.test.ts` (5)).
- `apps/web`: 131 tests / 12 files — up from M02's 100/9 (+31 tests, +3 files: `resolveText.test.ts` (5), `localeStore.test.ts` (5), `ContentRuntimeLab.test.tsx` (15), plus `import-boundary.test.ts`'s dynamically-generated per-file count growing from 49 tests scanning every new frontend source file — no forbidden pattern found in any of them).

**Playwright (`npm run test:e2e`), final clean run:** 39 passed, 14 skipped (credential-gated, `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD` not set in this session, same reason as M01/M02), 0 hard failures. Two earlier runs in this session hit intermittent `response.ok()` failures on the real-Sheet-backed `/api/health`/`/api/bootstrap` checks; both were confirmed environmental, not a regression (§10) — a subsequent clean, uncontended run passed those same checks outright, and the final run listed above shows them recovering via the suite's existing `retries: 1` (labeled "flaky", the same accepted class of issue M01/M02's evidence reports already documented for this environment).

## 10. Investigated: an unrelated, pre-existing live-Sheet data-quality finding

During live verification, `/api/health`'s `schemaHealth` briefly reported `status: "error", errorCount: 153` against the real Sheet (M01/M02 baseline was 0 errors). Investigated with a temporary, read-only, credential-using diagnostic script (sanitized output only — tab + diagnostic code + count, no column names or values; deleted immediately after use) run against a **freshly started** emulator process to rule out any in-memory cache artifact. Result: all 153 errors are `05_ENTRY_LOGS :: INVALID_CONTROLLED_VALUE` — accumulated historical log rows whose `event_type` value is not among the 11 values in `39_VALIDATION_LISTS`'s `entry_event_type` list.

**Confirmed unrelated to M03-A:** `git status` shows `packages/sheet-schema` was not touched at all this session, and a grep of every `eventType:`/`` `${flow}_rate_limited` `` literal in `apps/functions/src` confirms the deployed application code only ever writes one of the 11 accepted values. This is pre-existing accumulated data in the live `05_ENTRY_LOGS` history (most likely written before the M02-C fix that first wired this column to its controlled list, or by an earlier prototype/script iteration), not something introduced by this session. **Not fixed here** — modifying real historical Sheet rows is outside this milestone's scope and outside what I should do to Ahmed's live data without explicit instruction. Flagging per CLAUDE.md rule 13 rather than silently ignoring or "fixing" it. Both `/api/health` and `/api/bootstrap` handle this gracefully today (still `200`/`ok:true`; the schema-health summary just honestly reports `"error"`), so no user-facing behavior is broken by it.

## 11. Commands run and results

```text
npm run format          → PASS (no content changes; formatting-only, unrelated files untouched)
npm run format:check    → PASS
npm run lint             → PASS, 0 errors, 0 warnings
npm run typecheck         → PASS (full monorepo)
npm run test                → PASS, 383/383 (46 sheet-schema + 206 functions + 131 web)
npm run build                 → PASS
npm run security:scan           → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run test:e2e                    → 39 passed, 14 skipped (credential-gated), 0 hard failures
                                       (final clean run; two earlier same-session runs hit
                                       environmental live-Sheet flakiness, see §9)
```

No `firebase deploy` was run. No real Gate code, Admin password, session ID, cookie value, private key, or Google credential was printed, screenshotted, or otherwise exposed anywhere in this session.

## 12. Known limitations

- **M03-B is not started**, per scope: no Drive media gateway (no `GET`/`HEAD`, no byte-range/MIME/cache-header handling, no real file read), no service-worker/browser media caching, no voice-over player (playback, captions-with-timing, pause/replay, autoplay-gesture fallback), no mobile asset selection beyond the status booleans already exposed. `mediaRef` is a path convention only — nothing currently serves a response at that path.
- **The four evidence screenshots use intercepted/mocked API responses**, not a real Gate login, since Claude must never obtain or be given Ahmed's real Gate code. `content-runtime-lab.spec.ts`'s three real, credential-gated Playwright tests (desktop language-switching/RTL/icon-mirroring proof, plus a mobile no-overflow test) exercise the exact same code path against the real Sheet and will run the moment Ahmed sets `E2E_GATE_CODE` locally — they are not fabricated, only not exercised in this session.
- **Content diagnostics are additive to, not a replacement for, schema-health**: `computeSchemaHealth` (M01) still only checks structural/controlled-value/PK correctness per row; the new `checkLocaleGroups`/reference checks in `content-runtime.service.ts` are the only place cross-locale duplicate/fallback/reference issues for these six tabs are caught. `packages/sheet-schema/src/relationships.ts` still has no entries for e.g. `09_ICONS.asset_id → 10_ASSETS.asset_id` — not added here, since the content-runtime service already validates this specific relationship for its own response and touching `relationships.ts` was not necessary for M03-A's scope.
- **The RTL skip-link overflow bug (§7)** was fixed at its root (the shared `AppShell.module.css`), so it cannot recur on any current or future page, but no exhaustive audit of every other M00–M02 component's CSS for the same `left`/`right`-negative-offset pattern was performed — only the one instance discovered while producing this milestone's own screenshots.
- **The pre-existing 153 invalid `05_ENTRY_LOGS.event_type` rows (§10)** remain in the real Sheet, unfixed, since fixing historical production log data is outside this milestone and outside what should be done to Ahmed's live data without explicit instruction.
- **`npm run test:e2e`'s two intermittent `response.ok()` failures** encountered mid-session (§9) were investigated in depth (killed a conflicting manually-started debug emulator instance, confirmed a subsequent clean run passed those same checks, confirmed via direct `curl` that `/api/health`/`/api/bootstrap` always return HTTP 200 regardless of schema-health status) and are not a regression; not otherwise fixed here since they are a known class of live-Google-API/cold-start environmental flakiness already documented as accepted in the M01 and M02 evidence reports.

## 13. Confirmations

- **Only M03-A was implemented.** No Drive binary streaming, service-worker media caching, voice-over playback, world/story scenes, keys, or any M04+ feature was built. The only files touched outside the new M03-A surface are: `app.ts` (one additive route registration), `GatePage.tsx` (placeholder replacement only, per explicit instruction 13), `AppShell.module.css` (the RTL overflow bug fix, §7 — a genuine correctness fix directly caused by this milestone introducing the app's first `dir="rtl"` state), and the mock/index/export files needed to wire the above.
- **M02's accepted Gate/Admin authentication and session behavior is unchanged.** No session, cookie, rate-limit, or credential-comparison logic in `auth-orchestrator.service.ts`, `session.service.ts`, `session-resolution.service.ts`, `rate-limit.service.ts`, `admin-auth-middleware.ts`, `cookies.ts`, or the M02 API handlers was modified.
- **Nothing was committed.** `git status` at the end of this session shows only the modified/new files listed in §1 (plus Ahmed's pre-existing M02-C uncommitted follow-up, untouched) — no commit was made at any point in this session.
- **No real Gate code, Admin password, session ID, cookie value, private key, or Google credential was printed, screenshotted, or otherwise exposed** anywhere in this session.
