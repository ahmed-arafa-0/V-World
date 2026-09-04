# M00 — Project Foundation: Evidence Report

**Milestone:** M00 — Project Foundation
**Date:** 2026-09-04
**Scope:** Repository skeleton, quality gates, placeholder frontend, health-only backend. No world content, no Gate, no Google Sheets/Drive/Gemini/Firebase production connections.

---

## 1. Conflicts / discrepancies found before implementation

Two minor, non-blocking discrepancies were found between the governing documents and the M00 prompt. Neither affects M00 scope, so implementation proceeded per the current milestone prompt (highest immediate authority) with both flagged here for review:

1. **Tab count mismatch.** The Living Bible (§3B) and Master Build Plan (§M01) both say the Sheets blueprint has **40** tabs; the M00 prompt says "Do not create the **42** Google Sheet tab contracts yet." Not blocking for M00 (no tab contracts are created either way) — worth reconciling before M01.
2. **`config-private/google-service-account.json` in the Master Build Plan's illustrative repo tree.** Master Build Plan §4 shows this file physically present in the final-state tree. M00's explicit requirement is that the file **must not exist** in the repository during M00. Treated the Master Build Plan tree as an illustration of the eventual (post-M01) state, not a literal M00 requirement. The file does not exist in this repository (verified in §8 below).

No other conflicts were found. The Living Bible and Master Build Plan otherwise agree on the M00-relevant architecture (React/Vite/TS, Firebase Hosting + Functions, no Firebase Storage, Sheets/Drive/Gemini all deferred past M00).

## 2. Structural adjustments from the Master Build Plan's full-project tree

The Master Build Plan's repository tree (§4) shows the _complete, final_ project shape across all 18 milestones. M00 intentionally created a subset:

- `apps/web/src/features/` contains only `home/`, `admin/`, and `not-found/` — the feature areas this milestone needs. The other feature directories listed in the Master Build Plan (`access`, `arcade`, `birthday`, `characters`, `church`, `cottage`, `farm`, `map`, `museum`, `navigation`, `progression`, `scenes`, `vinyl-cafe`, `walkman`) were **not** pre-created, to avoid scaffolding unimplemented systems.
- `packages/` contains only `contracts/`. `sheet-schema/` and `test-fixtures/` are deferred to M01, where the 40/42-tab contracts are implemented.
- `docs/sheet-tab-contracts.md`, `docs/acceptance-evidence/`, and `docs/runbooks/` are not created yet — first needed starting M01.

## 3. Repository tree (M00 output)

```
V-World/
├── .firebaserc
├── .gitignore
├── .prettierignore
├── CLAUDE.md
├── README.md
├── eslint.config.js
├── firebase.json
├── package.json
├── package-lock.json
├── playwright.config.ts
├── prettier.config.js
├── tsconfig.base.json
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── app/            (App, AppRoutes, AppShell, ErrorBoundary + CSS Modules)
│   │   │   ├── components/     (LoadingState, BackendStatus + CSS Modules)
│   │   │   ├── features/
│   │   │   │   ├── home/       (HomePage + CSS Module)
│   │   │   │   ├── admin/      (AdminPage + CSS Module)
│   │   │   │   └── not-found/  (NotFoundPage + CSS Module)
│   │   │   ├── services/       (healthClient, useBackendHealth)
│   │   │   ├── styles/         (global.css)
│   │   │   ├── main.tsx
│   │   │   └── vite-env.d.ts
│   │   └── tests/               (6 test files, 32 tests)
│   └── functions/
│       ├── package.json
│       ├── tsconfig.json
│       ├── config-private/
│       │   └── README.md        (google-service-account.json intentionally absent)
│       ├── src/
│       │   ├── api/health.ts
│       │   ├── app.ts
│       │   ├── config/google-credential-loader.ts
│       │   ├── index.ts         (Firebase Functions v2 HTTPS export)
│       │   └── local-server.ts  (plain Express dev server)
│       └── tests/                (3 test files, 12 tests, + 3 credential fixtures)
├── packages/
│   └── contracts/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/ (health.ts, config-status.ts, api-error.ts, index.ts)
├── docs/
│   ├── Veoullas_World_Living_Bible.md      (pre-existing, unmodified)
│   ├── Claude_Code_Master_Build_Plan.md    (pre-existing, unmodified)
│   ├── Veoullas_World_Google_Sheets_Blueprint.xlsx  (pre-existing, unmodified, existence confirmed)
│   └── reports/
│       ├── M00_EVIDENCE.md      (this file)
│       └── M00/                 (4 screenshots)
├── scripts/
│   ├── security-boundary-scan.mjs
│   └── capture-m00-screenshots.mjs
└── tests/
    └── e2e/  (5 Playwright spec files, 16 tests across 2 device projects)
```

## 4. Changed / created files

Everything above is newly created in this session. Nothing pre-existing was modified — the three files under `docs/` (Living Bible, Master Build Plan, Sheets blueprint) were read-only inputs and were not edited. The repository had an existing `.git` with one prior commit ("First Commit") containing only the `docs/` folder; no commit was made in this session (per instructions, commits are only made when requested).

## 5. Installed main dependencies (resolved versions)

| Package                | Version                  | Workspace                                                    |
| ---------------------- | ------------------------ | ------------------------------------------------------------ |
| react / react-dom      | 18.3.1                   | apps/web                                                     |
| react-router-dom       | 6.30.6                   | apps/web                                                     |
| zustand                | 4.5.7                    | apps/web (installed, not wired into any store yet — see §11) |
| vite                   | 5.4.21                   | apps/web                                                     |
| @vitejs/plugin-react   | (latest matching ^4.3.1) | apps/web                                                     |
| @testing-library/react | 16.3.3                   | apps/web                                                     |
| express                | 4.22.2                   | apps/functions                                               |
| cors                   | 2.8.6                    | apps/functions                                               |
| firebase-functions     | 5.1.1                    | apps/functions                                               |
| tsx                    | 4.23.13                  | apps/functions (dev server)                                  |
| typescript             | 5.9.3                    | all workspaces                                               |
| eslint                 | 9.39.5                   | root                                                         |
| prettier               | 3.9.6                    | root                                                         |
| vitest                 | 2.1.9                    | apps/web, apps/functions                                     |
| @playwright/test       | 1.62.1                   | root                                                         |
| firebase-tools         | 13.35.1                  | root (emulators only)                                        |

## 6. Exact commands run (in order) and results

```
npm install                          → succeeded (1119 packages; EBADENGINE warning only, non-fatal)
npm run format:check                 → PASS (after adding .prettierignore for docs/*.md and a malformed-JSON test fixture)
npm run lint                         → PASS, 0 errors, 0 warnings
npm run typecheck                    → PASS (fixed a missing type import and 3 missing `override` modifiers)
npm run test                         → PASS, 44/44 tests (12 functions + 32 web)
npm run build                        → PASS (contracts → functions → web)
npm run security:scan                → PASS, 3 files scanned in apps/web/dist, no forbidden strings
npm run dev:functions (manual check) → GET /api/health returned correct structured JSON; GET /api/does-not-exist returned structured 404
npm run emulators (manual check)     → Hosting emulator on :5050, Functions emulator on :5001, verified via curl
npm run test:e2e                     → PASS, 16/16 Playwright tests (desktop-chromium + mobile-chromium)
node scripts/capture-m00-screenshots.mjs → 4 screenshots written to docs/reports/M00/
```

## 7. Unit/integration test summary

**apps/functions (Vitest, 12 tests, 3 files):**

- `google-credential-loader.test.ts` (6 tests) — not_configured when file missing, invalid_format for malformed JSON, invalid_format for missing required fields, configured for a valid fixture, credential contents never leak into the status object, default path resolves under `config-private/`.
- `health.test.ts` (4 tests) — structured JSON with server-generated timestamp bounded by test start/end times, milestone `M00`, continues working with missing credentials, `resolveEnvironment()` detects emulator vs. local.
- `app.test.ts` (2 tests) — `GET /api/health` returns 200 with the full payload via Supertest; unknown route returns a structured `ApiError` 404 instead of a raw framework error.

**apps/web (Vitest + Testing Library, 32 tests, 6 files):**

- `routes.test.tsx` (3 tests) — `/` renders Home, `/admin` renders Admin, unknown path renders NotFound.
- `HomePage.test.tsx` / `AdminPage.test.tsx` (1 test each) — all required M00 placeholder text and links present.
- `healthClient.test.ts` (3 tests) — online/offline/network-failure branches of `fetchBackendHealth`.
- `contracts-compile.test.ts` (2 tests) — `HealthResponse`/`ApiError` from `@veoullas-world/contracts` compile and are usable from the frontend.
- `import-boundary.test.ts` (22 tests, one per source file) — every file under `apps/web/src` scanned for `google-service-account.json`, `config-private`, `private_key`, `private_key_id`, `BEGIN PRIVATE KEY`, and `@veoullas-world/functions`; none found.

## 8. Backend health endpoint — example response

Via `npm run dev:functions` (plain Express, no emulator):

```json
{
  "ok": true,
  "service": "veoullas-world-functions",
  "environment": "local",
  "timestamp": "2026-09-04T15:33:32.209Z",
  "milestone": "M00",
  "config": { "googleServiceAccount": { "present": false, "reason": "not_configured" } }
}
```

Via the Firebase Hosting emulator rewrite (`GET http://127.0.0.1:5050/api/health`), confirming the same-origin `/api/**` rewrite works end-to-end:

```json
{
  "ok": true,
  "service": "veoullas-world-functions",
  "environment": "emulator",
  "timestamp": "2026-09-04T15:36:40.257Z",
  "milestone": "M00",
  "config": { "googleServiceAccount": { "present": false, "reason": "not_configured" } }
}
```

`apps/functions/config-private/google-service-account.json` does not exist in this repository (confirmed by direct file check), so this response demonstrates the required missing-credential path, not a stubbed value.

## 9. Credential-boundary scan result

```
[security-boundary-scan] PASSED — scanned 3 file(s) in apps/web/dist, no forbidden credential references found.
```

Scanned patterns: `google-service-account.json`, `config-private`, `private_key`, `private_key_id`, `BEGIN PRIVATE KEY`, `GEMINI_API_KEY`, `@veoullas-world/functions`. This build-time scan (`scripts/security-boundary-scan.mjs`) runs against the compiled `apps/web/dist` bundle; the complementary `apps/web/tests/import-boundary.test.ts` runs the same check against frontend source on every `npm run test`.

## 10. Playwright test summary

16/16 passed across two projects (desktop-chromium, mobile-chromium) against the Firebase Hosting + Functions emulators (project `demo-veoullas-world`):

- `home.spec.ts` — Home shows required M00 content and links to Admin.
- `admin.spec.ts` — Admin shows required M00 content and links back to Home.
- `route-refresh.spec.ts` — reload on `/admin` and a fresh direct navigation to `/admin` both succeed via the SPA rewrite (no 404).
- `mobile-viewport.spec.ts` — Home and Admin render with no horizontal overflow at a 390×844 viewport.
- `backend-health.spec.ts` — both pages resolve a live `/api/health` response (200, `ok:true`, `milestone: "M00"`) and display "Backend status: online".

## 11. Screenshots

- Desktop Home: `docs/reports/M00/home-desktop.png`
- Desktop Admin: `docs/reports/M00/admin-desktop.png`
- Mobile Home: `docs/reports/M00/home-mobile.png`
- Mobile Admin: `docs/reports/M00/admin-mobile.png`

## 12. Known limitations

- Zustand is installed per the M00 instruction ("installed and prepared") but is not wired into any store — there is no shared global state yet, since none is needed for two static placeholder screens.
- `apps/functions` declares `"engines": { "node": "20" }` per Firebase's supported runtime, while local development ran on Node 22; `npm install` emits a non-fatal `EBADENGINE` warning. The Functions emulator itself also warns and falls back to the host's Node 22. Not a defect for M00; worth pinning a Node 20 toolchain before a real deployment milestone.
- `npm install` reports 24 dependency vulnerabilities (mostly transitive, via `firebase-tools`); none were investigated or patched in M00 since they are dev/tooling-only and out of scope for a foundation milestone with no production deployment.
- Firebase Hosting Emulator UI is disabled (`emulators.ui.enabled: false` in `firebase.json`) to keep the emulator footprint minimal for automated testing; can be re-enabled for manual exploration if useful.
- No `apps/web/public` assets exist yet (empty directory) since M00 uses no real artwork.

## 13. M00 acceptance checklist

| Acceptance item                                                     | Result                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm install` succeeds                                              | ✅                                                                  |
| Formatting check passes                                             | ✅                                                                  |
| Lint passes                                                         | ✅                                                                  |
| TypeScript typecheck passes                                         | ✅                                                                  |
| Unit/integration tests pass                                         | ✅ 44/44                                                            |
| Production build passes                                             | ✅                                                                  |
| Playwright acceptance passes                                        | ✅ 16/16                                                            |
| `/` loads                                                           | ✅ (dev, emulator, and Playwright)                                  |
| `/admin` loads                                                      | ✅ (dev, emulator, and Playwright)                                  |
| Direct refresh on `/admin` works through the Hosting emulator       | ✅ verified via curl and Playwright `route-refresh.spec.ts`         |
| `/api/health` returns valid structured JSON                         | ✅ both local dev server and Hosting emulator rewrite               |
| Missing Google credentials produce a controlled backend-only status | ✅ `not_configured`, no raw error, no file path leaked              |
| Frontend bundle contains no private credential reference or content | ✅ `security:scan` PASSED                                           |
| No M01+ world feature was implemented                               | ✅ confirmed, see §14                                               |
| No real Firebase deployment was attempted                           | ✅ only local demo project `demo-veoullas-world` and emulators used |

## 14. Explicit confirmations

- **No live Google Sheets, Google Drive, Gemini, or production Firebase service was accessed at any point during M00.** All backend work uses a typed, credential-free "not configured" status; `firebase.json`/`.firebaserc` point only at the local demo project `demo-veoullas-world`; only the Hosting and Functions emulators were started, never `firebase deploy`.
- **M01 was not started.** No Google Sheets gateway, typed tab contracts, schema validation, or Sheet fixtures were implemented. No Gate, island, Map, buildings, characters, birthday event, VAR, Marcelino, or real Admin controls exist. The `/admin` route is a static placeholder with explicit "No authentication implemented yet" text.
