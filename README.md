# Veoulla's World

Monorepo for Veoulla's World. This is a brand-new project (no legacy prototype code). See
[`CLAUDE.md`](./CLAUDE.md) for the standing implementation rules and
[`docs/Veoullas_World_Living_Bible.md`](./docs/Veoullas_World_Living_Bible.md) /
[`docs/Claude_Code_Master_Build_Plan.md`](./docs/Claude_Code_Master_Build_Plan.md) for product and
architecture authority.

**Current milestone: M00 — Project Foundation.** No world content, Gate, Map, or real Admin
controls exist yet. See [`docs/reports/M00_EVIDENCE.md`](./docs/reports/M00_EVIDENCE.md).

## Repository layout

```
apps/web/         React + Vite + TypeScript frontend
apps/functions/   Firebase Functions TypeScript backend (Express behind one HTTPS function)
packages/contracts/  Shared TypeScript types (HealthResponse, ApiError, BackendConfigStatus)
docs/             Living Bible, Master Build Plan, Sheets blueprint, evidence reports
tests/e2e/        Playwright end-to-end tests
```

## Prerequisites

- Node.js 20+ (repo tested on Node 22)
- npm 10+

## Install

```
npm install
```

This installs all three workspaces (`apps/web`, `apps/functions`, `packages/contracts`) from the
root, via npm workspaces.

## Frontend development mode

Runs the Vite dev server with hot reload on `http://localhost:5173`. Requests to `/api/*` are
proxied to the backend dev server on port 5001 (start that separately, see below).

```
npm run dev:web
```

## Backend development mode

Runs the Express app directly with `tsx` (no Firebase emulator needed) on
`http://localhost:5001`.

```
npm run dev:functions
```

Run this alongside `npm run dev:web` for full frontend+backend local development.

## Full Firebase emulator mode

Builds `packages/contracts`, `apps/web`, and `apps/functions`, then starts the Hosting +
Functions emulators against the local demo project `demo-veoullas-world` (no real Firebase
project, no real credentials):

```
npm run emulators:build
```

- App: `http://127.0.0.1:5050`
- `/api/**` is rewritten to the `api` function
- All other paths are rewritten to `/index.html` (SPA rewrite), so direct refresh on `/admin`
  works.

## Tests

```
npm run test        # unit/integration tests (contracts build + functions + web, via Vitest)
npm run test:e2e     # Playwright end-to-end tests (builds and boots the Firebase emulator)
```

## Quality gates

```
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run security:scan   # scans apps/web/dist for backend-only credential leakage; run after build
```

## Credentials (M01+)

`apps/functions/config-private/google-service-account.json` does not exist in this repository and
must never be committed. See
[`apps/functions/config-private/README.md`](./apps/functions/config-private/README.md) for where
Ahmed will place it starting in M01. Until then, `GET /api/health` reports a typed
`not_configured` status and continues to work normally.
