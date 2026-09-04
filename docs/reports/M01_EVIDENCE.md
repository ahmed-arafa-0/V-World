# M01 — Google Sheets Gateway and Schema Health: Evidence Report

**Milestone:** M01 — Google Sheets Gateway and Schema Health
**Date:** 2026-09-04
**Scope:** Backend-only Google Sheets gateway (cache/read/update/append/idempotency), the 42-tab typed registry, a schema-health diagnostic service, a sanitized public bootstrap API, a temporary unauthenticated Admin Schema Health view, and a manual live-verification script against the real Sheet. No Gate, world scenes, sessions/IP logging, player-progress writes, or real Admin authentication were implemented.

---

## 1. Preflight result

All 8 required preflight checks passed against the real Google Sheet and Drive, using the credential at `apps/functions/config-private/google-service-account.json` (never printed, never committed).

| #   | Check                                                                                       | Result                                                               |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Credential file exists and is valid JSON                                                    | ✅                                                                   |
| 2   | `client_email` matches `veoullas-world-backend@veoullas-world-data.iam.gserviceaccount.com` | ✅                                                                   |
| 3   | Git ignores the credential file                                                             | ✅ (`.gitignore:15` matches it; confirmed via `git check-ignore -v`) |
| 4   | Service account can read spreadsheet metadata                                               | ✅                                                                   |
| 5   | Live spreadsheet contains exactly the expected 42 tabs                                      | ✅                                                                   |
| 6   | Tab names match the workbook exactly (no missing, no extra)                                 | ✅                                                                   |
| 7   | `01_APP_CONFIG` contains `drive_root_folder_id` = `1JsFD1SIVl36pGS1yKiccGZBu7n-nwfnq`       | ✅                                                                   |
| 8   | Google Sheets API access succeeds (Drive API access also verified)                          | ✅                                                                   |

**One blocker occurred and was resolved before implementation began:** the first preflight attempt failed with HTTP 403 — "Google Sheets API has not been used in project 886348107880 before or it is disabled." Work stopped immediately per instructions; no fake success was reported. Ahmed enabled the Google Sheets API and Google Drive API on the `veoullas-world-data` GCP project; the preflight was re-run and passed completely (table above) before any M01 code was written.

## 2. Documentation reconciliation result

Both governing documents contained exactly one stale "40 tabs" statement each; both are now corrected to 42, per the accepted workbook v0.2:

- `docs/Veoullas_World_Living_Bible.md` §3B: "The workbook contains 40 organized tabs" → "42 organized tabs". The tab catalog bullet list in that section did not mention the VAR conversation/memory tables, so a bullet was added recognizing `40_VAR_CONVERSATIONS` and `41_VAR_MEMORIES` (append-only VAR conversation archive and durable cross-session VAR memories).
- `docs/Claude_Code_Master_Build_Plan.md` M01 section: "Implement typed contracts for all 40 tabs" → "42 tabs".
- No other "40 tabs" references were found in either document (confirmed via a full-document search for the literal number 40 in Living Bible; none remained after the fix).
- Both documents already said "42" nowhere before this correction, and neither needed broader edits — only the two stale statements above were touched.

## 3. Changed / created files

**New packages:**

- `packages/sheet-schema/` — tab registry (`src/tabs/*.ts`, `src/registry.ts`), normalization (`src/normalize.ts`), row parser (`src/row-schema.ts`), relationships (`src/relationships.ts`), validation-list builder, 00_README parser (`src/readme-contract.ts`), plus 4 test files (45 tests).
- `packages/test-fixtures/` — `GOOD_WORKBOOK` (all 42 tabs, realistic fake data, exact 5/8/18 counts, one intentional placeholder) and `BROKEN_WORKBOOK` (7 deliberate mutations, one per required diagnostic class).

**Backend (`apps/functions`):**

- New: `src/config/resource-config.ts` (Sheet ID + env override), `src/errors/app-error.ts`, `src/google/{types,google-error-mapper,real-sheets-client,client-factory}.ts`, `src/repositories/{cache,key-mutex,retry,sheet-gateway,gateway-context}.ts`, `src/services/{schema-health,bootstrap,secrets}.service.ts`, `src/api/{bootstrap,schema-health}.ts`.
- New tests: `tests/{cache,retry,google-error-mapper,sheet-gateway,schema-health.service,bootstrap.service,secrets.service}.test.ts`, `tests/helpers/fake-sheets-client.ts`.
- Modified: `src/api/health.ts` (extended response, now gateway-aware), `src/app.ts` (wires bootstrap/schema-health routes, dependency-injectable gateway), `tests/{app,health}.test.ts` (rewritten to inject a fake gateway instead of hitting the real credential), `package.json` (added `googleapis`, `@veoullas-world/sheet-schema`, dev-dep `@veoullas-world/test-fixtures`).

**Contracts (`packages/contracts`):** new `src/schema-health.ts`, `src/bootstrap.ts`; extended `src/health.ts` (`sheets`, `schemaHealth`, `cache` fields) and `src/api-error.ts` (12 new error codes); `src/index.ts` updated.

**Frontend (`apps/web`):**

- New: `src/services/{apiClient,useApiResource,bootstrapClient,schemaHealthClient}.ts`, `src/components/BootstrapSummary.{tsx,module.css}`, `src/features/admin/{SchemaHealthTable,SchemaHealthDiagnostics}.{tsx,module.css}`.
- Modified: `src/components/BackendStatus.tsx` (now shows Sheet connection + schema health), `src/services/{healthClient,useBackendHealth}.ts` (refactored onto the generic client), `src/features/home/HomePage.tsx`, `src/features/admin/AdminPage.tsx` (full Schema Health view replacing the M00 placeholder), `src/styles/global.css` (added `--status-warning`).
- Tests: `tests/helpers/mockApi.ts` (new, per-URL fetch routing), rewrote `tests/{routes,HomePage,AdminPage,contracts-compile}.test.ts` for the new UI/contracts, expanded `tests/import-boundary.test.ts` forbidden-pattern list, fixed `tests/setup.ts` (added `afterEach(cleanup)` — DOM wasn't being cleaned up between tests in the same file, see §18).

**Root / scripts / e2e:**

- `package.json`: new workspaces (`packages/sheet-schema`, `packages/test-fixtures`), `build:libs`, `test:m01:live` scripts.
- `scripts/security-boundary-scan.mjs`: expanded forbidden-pattern list.
- `scripts/test-m01-live.mjs` (new): manual live verification.
- `scripts/capture-m01-screenshots.mjs` (new).
- `playwright.config.ts`: serial execution + longer timeouts (real external API, see §18).
- `tests/e2e/{home,admin,backend-health,mobile-viewport,route-refresh}.spec.ts` updated for the new UI; `tests/e2e/network-security.spec.ts` (new).
- `docs/`: reconciled tab counts (§2); `docs/reports/M01/` (4 screenshots) and this file.
- `.gitignore`: added `lib/` (see §18 — the M00 commit made by Ahmed outside this session had already committed `apps/functions/lib/` compiled output because M00's `.gitignore` only excluded `dist/`/`build/`, not `lib/`; fixed going forward, existing tracked files left untouched since untracking them is a git-history decision for Ahmed, not something to do unprompted).
- `apps/functions/config-private/README.md`, root `CLAUDE.md`, `README.md`: updated for M01.

## 4. Architecture summary

```
apps/functions/src/
  config/resource-config.ts       Backend-only Sheet ID (env-overridable), not a secret but never exposed to React
  google/                          GoogleSheetsClient interface + real googleapis implementation + error mapper + factory
  repositories/
    cache.ts                      TTL cache with request coalescing (concurrent identical reads share one call)
    key-mutex.ts                  Serializes concurrent writes to the same tab+key
    retry.ts                      Bounded exponential backoff, only for AppErrors marked retryable
    sheet-gateway.ts              THE gateway: read/batch-read/update-by-PK/append/appendIfAbsent
    gateway-context.ts            Production singleton (lazy, real credential)
  services/
    schema-health.service.ts      All diagnostics: missing/unexpected tabs, columns, PK issues, type issues,
                                   controlled-list issues, cross-tab references, placeholders, redaction
    bootstrap.service.ts          Sanitized, allowlisted public payload assembly
    secrets.service.ts            Backend-only 03_SECRETS_DEV reader (foundation only, not exposed via any route)
  api/{health,bootstrap,schema-health}.ts   Express handlers, each takes an injectable gateway provider
  app.ts                          Wires all three routes; accepts { getGateway } for tests

packages/sheet-schema/src/        Typed registry for all 42 tabs (columns, kinds, sensitivity, ownership,
                                   primary keys incl. one derived key), relationships, normalization, 00_README parser
packages/test-fixtures/src/       GOOD_WORKBOOK / BROKEN_WORKBOOK mock data, generated partly from the registry itself
```

Every Sheet read/write in the backend goes through `SheetGateway`; no other module touches `googleapis` or raw cell coordinates. React never imports anything from `apps/functions` (enforced by the import-boundary test and the security-boundary scan).

## 5. Full 42-tab contract/health matrix (live Sheet, `npm run test:m01:live` run)

| Tab                  | Status  | Req/Actual cols | Errors | Warnings | Info |
| -------------------- | ------- | --------------- | ------ | -------- | ---- |
| 00_README            | healthy | 0/0             | 0      | 0        | 0    |
| 01_APP_CONFIG        | warning | 6/6             | 0      | 1        | 0    |
| 02_USERS             | warning | 10/10           | 0      | 2        | 0    |
| 03_SECRETS_DEV       | warning | 8/8             | 0      | 3        | 0    |
| 04_ADMIN_FLAGS       | healthy | 9/9             | 0      | 0        | 0    |
| 05_ENTRY_LOGS        | healthy | 12/12           | 0      | 0        | 0    |
| 06_SESSIONS          | healthy | 11/11           | 0      | 0        | 0    |
| 07_LANGUAGES         | healthy | 10/10           | 0      | 0        | 0    |
| 08_UI_TEXT           | healthy | 10/10           | 0      | 0        | 0    |
| 09_ICONS             | healthy | 11/11           | 0      | 0        | 0    |
| 10_ASSETS            | warning | 12/12           | 0      | 35       | 0    |
| 11_LOCATIONS         | healthy | 11/11           | 0      | 0        | 0    |
| 12_SCENES            | warning | 12/12           | 0      | 14       | 0    |
| 13_ROUTES            | healthy | 10/10           | 0      | 0        | 0    |
| 14_STORY_BEATS       | healthy | 16/16           | 0      | 0        | 0    |
| 15_DIALOGUE          | healthy | 15/15           | 0      | 0        | 0    |
| 16_VOICEOVER         | healthy | 13/13           | 0      | 0        | 0    |
| 17_EVENTS            | healthy | 12/12           | 0      | 0        | 0    |
| 18_EVENT_PHASES      | healthy | 11/11           | 0      | 0        | 0    |
| 19_MESSAGES          | warning | 17/17           | 0      | 13       | 0    |
| 20_SONGS             | warning | 11/11           | 0      | 10       | 0    |
| 21_KEYS              | healthy | 10/10           | 0      | 0        | 0    |
| 22_KEY_RULES         | warning | 13/13           | 0      | 7        | 0    |
| 23_ACHIEVEMENTS      | warning | 12/12           | 0      | 4        | 0    |
| 24_PLAYER_PROGRESS   | healthy | 14/14           | 0      | 0        | 0    |
| 25_PLAYER_KEYS       | healthy | 10/10           | 0      | 0        | 0    |
| 26_PLAYER_ACHIEV     | healthy | 9/9             | 0      | 0        | 0    |
| 27_PLAYER_MESSAGES   | healthy | 13/13           | 0      | 0        | 0    |
| 28_FARM_CROPS        | healthy | 12/12           | 0      | 0        | 0    |
| 29_PLAYER_FARM       | healthy | 12/12           | 0      | 0        | 0    |
| 30_CHURCH_CONTENT    | warning | 14/14           | 0      | 6        | 0    |
| 31_CHURCH_QUIZ       | warning | 17/17           | 0      | 14       | 0    |
| 32_ARCADE_GAMES      | healthy | 14/14           | 0      | 0        | 0    |
| 33_PLAYER_SCORES     | healthy | 11/11           | 0      | 0        | 0    |
| 34_MUSEUM_EXHIBITS   | warning | 13/13           | 0      | 2        | 0    |
| 35_PLAYER_EXHIBITS   | healthy | 10/10           | 0      | 0        | 0    |
| 36_CHARACTERS        | healthy | 14/14           | 0      | 0        | 0    |
| 37_CHARACTER_STATE   | healthy | 14/14           | 0      | 0        | 0    |
| 38_DATA_DICTIONARY   | healthy | 8/8             | 0      | 0        | 0    |
| 39_VALIDATION_LISTS  | healthy | 5/5             | 0      | 0        | 0    |
| 40_VAR_CONVERSATIONS | warning | 18/18           | 0      | 2        | 0    |
| 41_VAR_MEMORIES      | warning | 13/13           | 0      | 1        | 0    |

**Totals:** 42/42 tabs found, 28 healthy, 14 warning, **0 errors**, 114 warnings, 0 info. All warnings are `PLACEHOLDER_VALUE` (un-replaced `<...>` values Ahmed hasn't filled in yet, e.g. Drive file IDs, the Gemini model ID) — exactly the "intentional future asset placeholder" case the spec requires to be a non-blocking warning. Required vs. actual column counts match everywhere (no drift between the live Sheet and the registry).

## 6. Exact commands run and sanitized results

```
npm install                    → succeeded (1116 packages; EBADENGINE warning only, non-fatal)
npm run format:check           → PASS
npm run lint                   → PASS, 0 errors, 0 warnings
npm run typecheck              → PASS (build:libs → functions → web)
npm run test                   → PASS, 166/166 (45 sheet-schema + 74 functions + 47 web)
npm run build                  → PASS (contracts → sheet-schema → test-fixtures → functions → web)
npm run security:scan          → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run test:m01:live          → PASSED, 18/18 checks (see §9)
npm run test:e2e               → 26/26 passed (1 required its configured retry; see §18)
```

No `npm audit fix --force` was run. No `firebase deploy` was run or attempted.

## 7. Unit/integration test totals

**166 tests, 20 files, all passing, zero network/credential dependency:**

- `packages/sheet-schema`: 45 tests / 4 files — registry completeness (exactly 42, no duplicates, correct primary keys incl. the one derived key), normalization (boolean/integer/number/csv/json/date incl. Google Sheets serial-date conversion), row parsing (blank rows ignored, unknown columns preserved, missing-column/duplicate-PK/blank-PK/invalid-value/placeholder detection, sanitized messages), 00_README dashboard parsing.
- `apps/functions`: 74 tests / 10 files — credential loader (missing/invalid/valid via fixtures), health/bootstrap/schema-health routes (via Supertest + fake gateway), TTL cache (cached/expired/bypass/dedup/invalidate), retry (retryable vs. not, bounded attempts), Google error mapping, the gateway itself (16 tests: cached read, duplicate-PK detection, batch reads sharing one call, cache invalidation after update, partial update preserving unrelated/unknown columns, formula-column safety — only the patched cell is ever written, PK-change protection, row-not-found, append-by-header regardless of object key order, duplicate-append rejection, idempotent append retry, concurrent-write serialization), schema-health service (12 tests against `GOOD_WORKBOOK`/`BROKEN_WORKBOOK`: healthy status with allowed placeholder warnings, missing tab, duplicate PK, blank PK, invalid boolean/integer/controlled-value, broken cross-tab reference, sensitive-column redaction), bootstrap service (exact 5/8/18 counts, allowlisted config, no raw Drive file IDs, no secrets), secrets service (enabled/disabled/not-found via fake fixtures).
- `apps/web`: 47 tests / 6 files — Home/Admin content and live states, routing, the generic `fetchJson` client (online/offline/network-failure), contracts compile, and 32 dynamically-generated import-boundary tests (one per frontend source file) scanning for all 11 forbidden patterns.

## 8. Playwright test totals

**26/26 passed** across `desktop-chromium` and `mobile-chromium`, run against the real Firebase Hosting + Functions emulators (project `demo-veoullas-world`) with the **real credential and real Sheet** — no mocks in e2e:

- `home.spec.ts` — M01 title, live "Google Sheet connection: connected", schema-health line, bootstrap counts, navigation to Admin.
- `admin.spec.ts` (3 tests) — Schema Health view + M02 notice + link home; search filters the live 42-row table; bypass-cache refresh control works.
- `backend-health.spec.ts` (2 tests) — live `/api/health` (`milestone: "M01"`, `sheets.reachable: true`) and live `/api/admin/schema-health` (`expectedTabCount: 42`) both reflected in the UI.
- `mobile-viewport.spec.ts` (2 tests) — no horizontal overflow on Home/Admin at 390×844.
- `network-security.spec.ts` (3 tests, new) — `/api/health`, `/api/bootstrap`, `/api/admin/schema-health` responses scanned for `private_key`, `client_email`, `gate_code_plaintext`, `admin_password_plaintext`, `plaintext_value`, `gserviceaccount.com`, etc.
- `route-refresh.spec.ts` (2 tests) — direct `/admin` refresh and fresh navigation via the Hosting SPA rewrite.

One test (`admin.spec.ts` "shows the Schema Health view…") needed its configured retry once, due to cold-start latency on the very first live network call of the whole suite — see §18.

## 9. Live Sheet verification result (`npm run test:m01:live`)

**18/18 checks passed.** Full sanitized output:

```
=== 1. Credential and Sheet resource configuration ===
  PASS  Real Google credential is present and loads
  Using Sheet ID: 12nXHF…VmNI (masked)

=== 2. Spreadsheet access and tab names ===
  PASS  Sheets API metadata call succeeds
  PASS  Exactly 42 tabs found
  PASS  All 42 expected tab names are present
  PASS  No unexpected tab names

=== 3. drive_root_folder_id in 01_APP_CONFIG ===
  PASS  drive_root_folder_id row exists
  PASS  drive_root_folder_id matches the approved Drive folder ID

=== 4. Bootstrap data (5 languages, 8 locations, 18 first-journey beats, current event) ===
  PASS  Exactly 5 enabled languages
  PASS  Exactly 8 enabled locations
  PASS  Exactly 18 enabled first-journey beats
  PASS  A current event is configured and resolved
  PASS  Bootstrap payload contains no raw Drive file ID

=== 5. Schema health ===
  PASS  Schema health computed without throwing
  PASS  No structural ERROR diagnostics on the live workbook
  Status: warning (114 warning(s), 0 info)

=== 6. Cache bypass proof (read-only) ===
  PASS  Bypass read succeeds independently of the cached read

=== 7. Reversible write probe on 01_APP_CONFIG.app_name ===
  PASS  app_name row exists
  Original app_name: "Veoulla's World"
  PASS  Probe value was written and is visible on a cache-bypassed read
  PASS  Original app_name value was restored exactly

=== Summary ===
  18 passed, 0 failed

M01 LIVE VERIFICATION PASSED. app_name was restored to its original value.
```

## 10. Proof that `app_name` was restored

From the run above: `Original app_name: "Veoulla's World"`, followed by `PASS Probe value was written and is visible on a cache-bypassed read` (probe value was `M01_LIVE_PROBE_<timestamp>`, never left in the Sheet), followed by `PASS Original app_name value was restored exactly` — the restoration is verified with its own cache-bypassed read inside the `finally` block, not assumed. The script also independently confirmed live via the Home page screenshot (§ screenshots) that `01_APP_CONFIG.app_name` reads `Veoulla's World` (the original value) after the script completed. Had restoration failed, the script would have printed a `🚨 CRITICAL` block and exited non-zero instead of reporting success — it did not.

## 11. Bootstrap example (sensitive values removed — none were present to begin with)

Live `GET /api/bootstrap` response (truncated for length; full arrays have 5/8/18/11/27 entries respectively as counted):

```json
{
  "ok": true,
  "config": {
    "appName": "Veoulla's World",
    "defaultLanguage": "en",
    "normalStartLocation": "cottage",
    "authoritativeTimeZone": "Africa/Cairo"
  },
  "languages": [
    {
      "localeId": "en",
      "shortCode": "EN",
      "englishName": "English",
      "nativeName": "English",
      "direction": "ltr",
      "sortOrder": 1
    },
    "...4 more"
  ],
  "locations": [
    {
      "locationId": "gate",
      "displayNameTextId": "location_gate",
      "subtitleTextId": "",
      "mapOrder": 0
    },
    "...7 more"
  ],
  "storyBeats": [
    { "beatId": "beat_01_boot", "sequence": 1, "locationId": "gate", "beatType": "cinematic" },
    "...17 more, ending beat_18_complete/locationId:\"map\""
  ],
  "icons": [
    { "iconId": "icon_map", "category": "ui", "displayName": "Map", "format": "svg" },
    "...10 more"
  ],
  "assets": [
    {
      "assetId": "asset_gate_bg",
      "assetType": "image",
      "locationId": "gate",
      "sceneId": "scene_gate_closed",
      "version": 1,
      "preloadPriority": 1,
      "enabled": true,
      "mediaRef": null
    },
    "...26 more, all mediaRef: null"
  ],
  "currentEvent": {
    "eventId": "birthday_2026",
    "eventName": "Veoulla Birthday 2026",
    "eventType": "birthday"
  },
  "sheetVersion": "0.2",
  "cacheGeneratedAt": "2026-09-04T...",
  "schemaHealth": { "status": "warning", "errorCount": 0, "warningCount": 114 },
  "requestId": "<uuid>"
}
```

No `drive_file_id`, `mediaRef` is `null` for every asset (M03's Drive media gateway does not exist yet, as required), and `config` only ever contains the 4 allowlisted keys — `01_APP_CONFIG` has 13 rows total, but only these 4 are ever exposed.

## 12. Health response example (live emulator)

```json
{
  "ok": true,
  "service": "veoullas-world-functions",
  "environment": "emulator",
  "timestamp": "2026-09-04T18:32:22.945Z",
  "milestone": "M01",
  "config": { "googleServiceAccount": { "present": true, "reason": "configured" } },
  "sheets": { "reachable": true },
  "schemaHealth": { "status": "warning", "errorCount": 0, "warningCount": 114 },
  "cache": { "entryCount": 43, "ttlSeconds": 60 }
}
```

No service-account email, file path, or credential fragment appears anywhere in this response (also proven by `tests/health.test.ts` and `tests/e2e/network-security.spec.ts`).

## 13. Cache update/bypass proof

- **Unit-level** (`tests/cache.test.ts`, `tests/sheet-gateway.test.ts`): cached reads serve without a second client call; bypass forces a reload and refreshes the cached value; concurrent identical requests are deduplicated into one loader call (proven via a manually-resolved promise and a call counter); `updateByPrimaryKey` invalidates the tab's cache entry so the next default (non-bypass) read reflects the change.
- **Live-level** (§9, section 6): a cached read followed immediately by a `{ bypass: true }` read against the real Sheet both succeed and return consistent data.
- **After 01_APP_CONFIG loads**, the bootstrap/health services respect `sheet_refresh_seconds` if present (60s default per spec); the live cache reported `ttlSeconds: 60` in §12.

## 14. Schema-error fixture proof

`packages/test-fixtures/src/broken-workbook.ts` deep-clones `GOOD_WORKBOOK` and applies exactly 7 mutations, each mapped to one required diagnostic and each proven by a dedicated test in `apps/functions/tests/schema-health.service.test.ts`:

| Mutation                                            | Diagnostic proven                                |
| --------------------------------------------------- | ------------------------------------------------ |
| Delete `18_EVENT_PHASES` entirely                   | `TAB_MISSING`                                    |
| Duplicate a `21_KEYS` row (`key_shell` twice)       | `DUPLICATE_PRIMARY_KEY`                          |
| Blank `11_LOCATIONS`' "church" row `location_id`    | `BLANK_REQUIRED_ID`                              |
| `07_LANGUAGES.enabled` = `"maybe"`                  | `INVALID_BOOLEAN`                                |
| `07_LANGUAGES.direction` = `"sideways"`             | `INVALID_CONTROLLED_VALUE`                       |
| `22_KEY_RULES.key_type_id` = `"key_does_not_exist"` | `INVALID_REFERENCE` (broken cross-tab reference) |
| `14_STORY_BEATS.sequence` = `"not-a-number"`        | `INVALID_INTEGER`                                |

The resulting workbook reports `summary.status === 'error'` with `errorCount > 0`, while `GOOD_WORKBOOK` (which intentionally includes one un-replaced Drive-ID placeholder) reports zero errors and only `WARNING`-severity placeholder diagnostics — proving placeholders never block a healthy bootstrap while genuine structural problems do surface as errors.

## 15. Append/update/idempotency test proof

From `apps/functions/tests/sheet-gateway.test.ts` (16 tests, all passing against a fake in-memory Sheets client):

- **Update**: only the explicitly patched column is ever sent to the client (`callCounts.updateValues === 1` for a single-field patch) — proving formula/unrelated columns are never touched; unrelated and unknown (schema-drift) columns are preserved byte-for-byte; attempting to change the primary key column itself is silently stripped; a missing key throws `ROW_NOT_FOUND`; concurrent updates to the same row are serialized via a per-`tab:key` mutex and always leave the Sheet in one of the two intended states, never a corrupted mix.
- **Append**: rows are built from live header order regardless of the input object's key order; a duplicate primary key is rejected (`DUPLICATE_PRIMARY_KEY`) rather than silently appended; a blank primary key is rejected (`invalid_request`).
- **Idempotency**: `appendIfAbsent(tab, primaryKeyValue, buildRow)` — a retry with the same key returns the exact original row (`created: false`) without a second `appendValues` call (`callCounts.appendValues === 1` after two calls). This is the reusable foundation the spec asked for; no M04 reward/progress semantics were built on top of it.

## 16. Credential Git-ignore proof (no credential contents)

```
$ git check-ignore -v apps/functions/config-private/google-service-account.json
.gitignore:15:apps/functions/config-private/*.json	apps/functions/config-private/google-service-account.json

$ git status --short apps/functions/config-private/
 M apps/functions/config-private/README.md
```

The credential file itself never appears in `git status` (staged, unstaged, or untracked) — only the `README.md` in that folder, which contains no credential material.

## 17. Frontend source/bundle/network security-scan result

- **Source scan** (`apps/web/tests/import-boundary.test.ts`, 32 dynamically-generated tests, one per frontend source file): scans for `google-service-account.json`, `config-private`, `private_key`, `private_key_id`, `BEGIN PRIVATE KEY`, `client_email`, `gate_code_plaintext`, `admin_password_plaintext`, `plaintext_value`, `AUTHORIZATION_KEY`, `@veoullas-world/functions`. All pass.
- **Built-bundle scan** (`npm run security:scan`): `[security-boundary-scan] PASSED — scanned 3 file(s) in apps/web/dist, no forbidden credential references found.` Same pattern list as above.
- **Live network scan** (`tests/e2e/network-security.spec.ts`, 3 tests): the actual HTTP responses from `/api/health`, `/api/bootstrap`, and `/api/admin/schema-health` — served by the real emulator talking to the real Sheet — were scanned for the same patterns plus `gserviceaccount.com`. All pass, including confirming the schema-health response never contains `gate_code_plaintext` literally (see next point).
- **A real finding, fixed**: the first `network-security.spec.ts` run caught that `/api/admin/schema-health`'s diagnostic `column` field could legitimately contain sensitive-sounding column names (e.g. `gate_code_plaintext`) as structural metadata, since a `PLACEHOLDER_VALUE` diagnostic on that column names the column. This was not a value leak, but the column-registry's `sensitive` flag (added for exactly this) had never actually been wired into the schema-health service. Fixed by redacting both the `column` field and rebuilding the `message` generically (never embedding the real name) whenever a column is flagged `sensitive` in the registry, or matches a defense-in-depth name pattern (`password|plaintext|private_key|secret|token|api_key|credential`) for columns the registry doesn't know about. Proven live in the Admin screenshot (`docs/reports/M01/admin-schema-health-desktop.png`): `02_USERS ([redacted])`, `03_SECRETS_DEV ([redacted])`.

## 18. Known limitations and non-blocking warnings

- **114 live placeholder warnings** — expected: the blueprint intentionally ships with un-replaced `<...>` Drive file IDs and a placeholder Gemini model ID pending real production assets (per the Living Bible's own `DEV_ONLY`/placeholder design). These are `WARNING`, never `ERROR`, and bootstrap succeeds despite them.
- **Cold-start Playwright flake**: the very first live network call of the whole Playwright run occasionally exceeds the 15s expect timeout (Functions emulator cold start + first real Google API round trip). Mitigated with `retries: 1`; one test needed its retry in the recorded run. Serial execution (`workers: 1`) was also adopted for this suite since it exercises one real external API rather than isolated mocks — full parallelism isn't the goal here.
- **`apps/functions` targets Node 20** (Firebase's supported runtime) while local dev runs on Node 22; `npm install`/the Functions emulator both emit non-fatal warnings about this mismatch (unchanged from M00).
- **`apps/functions/lib/` build output was already committed to git** in the "M00 — Project Foundation" commit made by Ahmed outside this session, because M00's `.gitignore` excluded `dist/`/`build/` but not `lib/` (the actual `outDir` for `apps/functions`). Fixed the gap in `.gitignore` going forward; did not touch the already-tracked files, since untracking existing history is Ahmed's call, not something to do unprompted. No secret is present in `lib/` — it is compiled application code only.
- **npm audit** reports 24 vulnerabilities, unchanged in nature from M00 (mostly transitive, via `firebase-tools`); not investigated per instructions not to run `npm audit fix --force`.
- **`zod` was declared as a sheet-schema dependency but never used** — the prompt allowed "if suitable"; a custom string-based normalizer (`normalize.ts`) fit this domain (raw Sheets strings, Google serial-date parsing) more directly than Zod schemas would have. Removed the unused dependency before finishing.
- **Relationship-check scope**: `RELATIONSHIPS` in `packages/sheet-schema/src/relationships.ts` is representative (~26 cross-tab checks), not exhaustive of every conceivable foreign key in the workbook — sufficient to prove the mechanism and catch the two real modeling issues found below.
- **Two registry mistakes were found and fixed against the real Sheet**, not the mock fixtures: (1) `37_CHARACTER_STATE.relationship_level` was declared `integer` but the real data uses qualitative text values (`"new"`); changed to `text`. (2) `12_SCENES.location_id` and `14_STORY_BEATS.location_id` were checked against `11_LOCATIONS` as a strict foreign key, but both legitimately use `"map"` (the island overview — `scene_map`, and the final beat `beat_18_complete`) as a valid `location` per `39_VALIDATION_LISTS`, which is not a physical row in `11_LOCATIONS`. Removed those two over-strict relationship checks; the `controlledList: 'location'` check on those columns already validates them correctly. Both fixes are documented inline in the source and reflected in the test suite.

## 19. Confirmation that no M02+ feature was implemented

No Gate UI or Gate-code verification, Admin login, sessions/IP logging/heartbeat/logout, First Journey state machine, player-progress writes, key rewards/inventory, island/world scenes, Map, localization switching, voice-over runtime, Drive media streaming/download, Walkman, Church/Café/VARcade/Cottage/Farm/Museum systems, birthday phase engine, VAR/Gemini, or Marcelino were built. `/api/admin/schema-health` is explicitly unauthenticated and read-only, with an in-UI notice ("No authentication implemented yet — Admin login arrives in M02") and a code-level note (`TEMPORARY_ENDPOINT_NOTE` in `schema-health.service.ts`) marking it as requiring M02 protection.

## 20. Confirmation that no deployment or Drive media download occurred

No `firebase deploy` was run at any point; `firebase.json`/`.firebaserc` still target only the local demo project `demo-veoullas-world`. No Google Drive file content was ever downloaded — the backend only read `drive_root_folder_id` (a folder ID string) from `01_APP_CONFIG` and confirmed Drive folder metadata access during preflight (folder existence/type only, via `drive.files.get` with `fields: 'id,name,mimeType'`); no `drive.files.list` or file-content read was performed, and the bootstrap API's asset descriptors never resolve or forward a Drive file ID (`mediaRef` is always `null`, since the M03 media gateway does not exist yet).

## Screenshots

- Desktop Home (Sheet-connected): `docs/reports/M01/home-sheet-connected-desktop.png`
- Desktop Admin (Schema Health): `docs/reports/M01/admin-schema-health-desktop.png`
- Mobile Home (Sheet-connected): `docs/reports/M01/home-sheet-connected-mobile.png`
- Mobile Admin (Schema Health): `docs/reports/M01/admin-schema-health-mobile.png`

## M01 acceptance checklist

| Item                                                                                     | Result                  |
| ---------------------------------------------------------------------------------------- | ----------------------- |
| `npm install`                                                                            | ✅                      |
| `npm run format:check`                                                                   | ✅                      |
| `npm run lint`                                                                           | ✅                      |
| `npm run typecheck`                                                                      | ✅                      |
| `npm run test`                                                                           | ✅ 166/166              |
| `npm run build`                                                                          | ✅                      |
| `npm run security:scan`                                                                  | ✅                      |
| `npm run test:m01:live`                                                                  | ✅ 18/18                |
| `npm run test:e2e`                                                                       | ✅ 26/26 (1 retry)      |
| Bootstrap returns config, 5 languages, 8 locations, 18 story beats, icons, current event | ✅                      |
| Sheet config value change reflected after cache expiry/bypass, no rebuild                | ✅ (proven unit + live) |
| Invalid/missing columns produce diagnostics + safe API error                             | ✅                      |
| Browser network responses never contain the Google credential or plaintext service keys  | ✅                      |
| Append/update prove stable primary-key behavior                                          | ✅                      |
| No M02+ feature implemented                                                              | ✅ (§19)                |
| No real deployment or Drive media download                                               | ✅ (§20)                |
