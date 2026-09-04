# Veoulla's World

Monorepo for Veoulla's World. This is a brand-new project (no legacy prototype code). See
[`CLAUDE.md`](./CLAUDE.md) for the standing implementation rules and
[`docs/Veoullas_World_Living_Bible.md`](./docs/Veoullas_World_Living_Bible.md) /
[`docs/Claude_Code_Master_Build_Plan.md`](./docs/Claude_Code_Master_Build_Plan.md) for product and
architecture authority.

**Current milestone: M01 — Google Sheets Gateway and Schema Health.** No Gate, island, Map,
characters, birthday event, or real Admin authentication exist yet. See
[`docs/reports/M01_EVIDENCE.md`](./docs/reports/M01_EVIDENCE.md) (and
[`docs/reports/M00_EVIDENCE.md`](./docs/reports/M00_EVIDENCE.md) for the foundation milestone).

## Repository layout

```
apps/web/               React + Vite + TypeScript frontend
apps/functions/          Firebase Functions TypeScript backend (Express behind one HTTPS function);
                         owns the Sheets gateway, schema-health service, bootstrap service, secrets repo
apps/functions/config-private/  Server-only credentials (never committed, never imported by apps/web)
packages/contracts/      Shared TypeScript types (health, bootstrap, schema-health, API errors)
packages/sheet-schema/   The 42-tab registry: column definitions, normalization, relationships, README parser
packages/test-fixtures/  Deterministic mock workbook fixtures for tests (no real data)
docs/                    Living Bible, Master Build Plan, Sheets blueprint, evidence reports
tests/e2e/               Playwright end-to-end tests (run against the real Sheet via the emulator)
```

## Prerequisites

- Node.js 20+ (repo tested on Node 22)
- npm 10+
- For live Sheets access: `apps/functions/config-private/google-service-account.json` (see
  [Credentials](#credentials) below). Not required for `npm install`, `npm run test`, or
  `npm run build` — those use mock fixtures and work with zero credentials.

## Install

```
npm install
```

This installs all workspaces (`apps/web`, `apps/functions`, `packages/contracts`,
`packages/sheet-schema`, `packages/test-fixtures`) from the root, via npm workspaces.

## Frontend development mode

Runs the Vite dev server with hot reload on `http://localhost:5173`. Requests to `/api/*` are
proxied to the backend dev server on port 5001 (start that separately, see below).

```
npm run dev:web
```

## Backend development mode

Runs the Express app directly with `tsx` (no Firebase emulator needed) on
`http://localhost:5001`. If the real credential is present, this hits the live Google Sheet;
otherwise `/api/health` reports a controlled `not_configured` status and `/api/bootstrap` /
`/api/admin/schema-health` return `503 backend_not_configured`.

```
npm run dev:functions
```

Run this alongside `npm run dev:web` for full frontend+backend local development.

## Full Firebase emulator mode

Builds `packages/contracts`, `packages/sheet-schema`, `packages/test-fixtures`, `apps/web`, and
`apps/functions`, then starts the Hosting + Functions emulators against the local demo project
`demo-veoullas-world` (no real Firebase project is used or deployed to):

```
npm run emulators:build
```

- App: `http://127.0.0.1:5050`
- `/api/**` is rewritten to the `api` function
- All other paths are rewritten to `/index.html` (SPA rewrite), so direct refresh on `/admin`
  works.
- If the real credential is present, this connects to the real Google Sheet (read-heavy; writes
  only happen from the manual live-verification script, never from normal browsing).

## Tests

```
npm run test          # unit/integration tests (sheet-schema + functions + web, via Vitest, mock fixtures only)
npm run test:e2e      # Playwright end-to-end tests (builds and boots the Firebase emulator)
npm run test:m01:live # manual-only live verification against the real Sheet (see below)
```

`npm run test` never touches the network or the real credential — it uses the deterministic
`GOOD_WORKBOOK` / `BROKEN_WORKBOOK` fixtures in `packages/test-fixtures`.

### Live verification (`test:m01:live`)

Manually invoked only — excluded from `npm run test` and CI. Requires the real credential file.
Confirms: credential loads, the live Sheet has exactly the 42 expected tabs, `drive_root_folder_id`
matches, bootstrap returns 5 languages / 8 locations / 18 first-journey beats, schema health has no
structural errors, and a reversible write probe on `01_APP_CONFIG.app_name` (write → verify →
restore in a `finally` block) leaves the Sheet unchanged. It never appends rows to the real Sheet.

```
npm run test:m01:live
```

## Quality gates

```
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run security:scan   # scans apps/web/dist for backend-only credential leakage; run after build
```

## Credentials

`apps/functions/config-private/google-service-account.json` is git-ignored and must never be
committed. See
[`apps/functions/config-private/README.md`](./apps/functions/config-private/README.md) for details.
Without it, `GET /api/health` reports a typed `not_configured` status and keeps working; endpoints
that need the Sheet (`/api/bootstrap`, `/api/admin/schema-health`) return a structured
`backend_not_configured` error instead of throwing.
