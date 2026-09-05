# M02-B2 — Authentication and Session API Runtime: Checkpoint

**Milestone:** M02-B2 (part of the approved M02 — Gate Access, Admin Access, Sessions, IP Logs)
**Date:** 2026-09-05
**Scope:** A complete HTTP authentication/session runtime wired on top of the M02-A access-foundation primitives (config loader, contracts, fixtures): page-open logging, Gate authentication, Admin authentication, Sheet-authoritative sessions, HttpOnly cookies, resume, heartbeat, logout, expired/terminated handling, persistent Gate/Admin rate limiting, and a protected `/api/admin/schema-health`. **No frontend Gate/Admin UI, Playwright tests, live authentication verification, final M02 evidence, or M03 feature was built.**

## 0. Scope note: M02-B1 did not exist in this repository

The M02-B2 prompt described itself as building on "the accepted M02-B1 rate-limit service" and "the centralized B1 resolver/service," and asked to read `docs/reports/M02_B1_CHECKPOINT.md`. Before starting, I verified: that file does not exist; `git log` shows no M02-B1 commit (only `M02-A — Access Foundation Checkpoint Only`); the working tree was clean (no uncommitted B1 work); and no rate-limit service, IP resolver, or cookie helper existed anywhere in `apps/functions/src`. Per CLAUDE.md's instruction to report conflicts rather than silently resolve them, I raised this with Ahmed before proceeding. Ahmed's direction: build the B1 primitives (rate-limit service, IP resolver, cookie helpers) and the B2 orchestration together under this one M02-B2 checkpoint, documenting that B1 was folded in. Everything below reflects that combined scope.

## 1. API routes

| Method | Route                          | Purpose                                                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| POST   | `/api/access/page-open`        | Idempotent `page_open` audit log                                                           |
| POST   | `/api/auth/gate`               | Veoulla's four-dial Gate entry                                                             |
| POST   | `/api/auth/admin`              | Admin login                                                                                |
| GET    | `/api/session/owner`           | Owner session resume                                                                       |
| POST   | `/api/session/owner/heartbeat` | Owner heartbeat                                                                            |
| DELETE | `/api/session/owner`           | Owner logout                                                                               |
| GET    | `/api/session/admin`           | Admin session resume                                                                       |
| POST   | `/api/session/admin/heartbeat` | Admin heartbeat                                                                            |
| DELETE | `/api/session/admin`           | Admin logout                                                                               |
| GET    | `/api/admin/schema-health`     | Now protected by the Admin authorization middleware (previously unauthenticated since M01) |

All routes are wired in `apps/functions/src/app.ts`, same-origin, on the existing single Express app.

## 2. Files changed / created

**New (`apps/functions/src`):**

- `http/cookies.ts` — cookie name constants, header parser, read/set/clear helpers.
- `http/ip-resolver.ts` — server-observed IP only.
- `services/entry-log.service.ts` — typed, idempotent `05_ENTRY_LOGS` append wrapper.
- `services/rate-limit.service.ts` — pure boundary logic (`computeRateLimitDecision`) + Sheet-backed wrapper (`evaluateRateLimit`).
- `services/session.service.ts` — session ID minting/kind derivation, idempotent creation, `last_seen_at` touch, safe summary builder.
- `services/session-resolution.service.ts` — the resume/expire/terminate/forbidden state machine (`resolveActiveSession`), shared by resume, heartbeat, and the Admin middleware.
- `services/auth-request-validation.ts` — strict, allowlisted request validators for Gate login, Admin login, and page-open.
- `services/auth-orchestrator.service.ts` — `attemptGateLogin` / `attemptAdminLogin`, the 9-step flow.
- `api/access.ts`, `api/auth.ts`, `api/session.ts`, `api/admin-auth-middleware.ts` — route handlers/middleware.

**Modified:**

- `app.ts` — wires all new routes, `trust proxy: 1`, injectable `now`/`isProduction` seams.
- `errors/app-error.ts` — HTTP status mapping for `SESSION_FORBIDDEN` (403).
- `api/schema-health.ts`, `services/schema-health.service.ts` — doc/note updated to reflect the route is now Admin-protected (was previously "temporary, unauthenticated... M02 protection required").
- `packages/contracts/src/access.ts` — reshaped for the real runtime (see §3).
- `packages/contracts/src/api-error.ts` — added `SESSION_FORBIDDEN`.
- `packages/contracts/src/index.ts` — export list updated to match.
- `apps/functions/tests/app.test.ts` — schema-health tests updated for the now-protected route.
- `apps/web/tests/contracts-compile.test.ts` — updated for the reshaped contracts.

**New tests (`apps/functions/tests`):** `cookies.test.ts`, `rate-limit.service.test.ts`, `session-resolution.service.test.ts`, `auth-api.test.ts`, `session-api.test.ts`, `auth-reconciliation.test.ts`, `helpers/flaky-sheets-client.ts`.

No dependency was added to any `package.json` — cookie parsing is a small hand-written module (Express's built-in `res.cookie`/`res.clearCookie` already cover setting/clearing; reading uses a minimal RFC 6265 parser over `req.headers.cookie`).

## 3. Contract changes from M02-A (and why)

M02-A's contracts were explicitly a foundation ("contracts only," no login implemented yet). This milestone is where the concrete security model had to become real, which required reshaping a few M02-A types — allowed under CLAUDE.md's authority order, since "the current milestone prompt" outranks "previously accepted code" for exactly this kind of refinement:

- **`SafeSessionSummary` no longer has a `sessionId` field.** The B2 prompt is explicit: "Never send a session ID inside a JSON response." Session identity now travels only in the HttpOnly cookie.
- **`GateLoginRequest.code: string` → `digits: string[]`.** The prompt requires "exactly four individual digits" as separate values, not a combined code string, and requires rejecting "strings containing more than one digit" — impossible to validate against a single combined string.
- **`deviceId` is now required** (was optional) on `GateLoginRequest`/`AdminLoginRequest` — needed for rate-limit scoping.
- **`attemptId` added** to both login requests — the "stable attempt ID" the prompt requires for idempotent retries.
- **`RateLimitState` gained `retryAfterSeconds`** — the prompt explicitly asks for a "safe `retryAfterSeconds`" in the 429 response, distinct from the static `cooldownSeconds` config value.
- **`SessionResumeRequest`/heartbeat/logout no longer carry a `sessionId` field** — they're cookie-transported now; `SessionResumeRequest` keeps only an optional `resumeOperationId` for log idempotency.
- **`PageOpenEvent.operationId` is now required** — "one operation ID creates one log only" requires one to exist.
- **New `SESSION_FORBIDDEN` error code (403)** — for a real, currently-active session presented as the wrong kind (see §8).

## 4. Auth orchestration (`services/auth-orchestrator.service.ts`)

One shared 9-step flow, implemented once per login type (`attemptGateLogin` / `attemptAdminLogin`) rather than duplicated ad hoc in the route handler:

1. Route handler validates request shape (`auth-request-validation.ts`) — happens before the orchestrator is even called.
2. Route handler resolves the server-observed IP (`http/ip-resolver.ts`).
3. Orchestrator loads M02 access config, bypassing the read cache (`loadAccessConfig(gateway, { bypass: true })`) — rate-limit thresholds are security-relevant, so a stale 60-second-old value is never trusted here, unlike ordinary content reads elsewhere in the app.
4. Evaluates the persistent rate-limit decision (`rate-limit.service.ts`), also always bypassing the cache.
5. If blocked: appends the `*_rate_limited` log idempotently, returns 429 with `retryAfterSeconds`.
6. Reads `02_USERS` bypassing the cache ("the private uncached backend repository" per the prompt) and finds the active owner (role `owner`, `active` true) or the named active Admin (role `admin`, `active` true, matching username).
7. Compares the submitted value to the Sheet value entirely inside this function — never in the route handler, never in a shared/cached place.
8. On failure: appends the `*_failure` log idempotently, returns a generic 401 with `remainingAttempts` decremented by one for UI purposes (see §7 for why this doesn't block yet).
9. On success: creates/reconciles the session (deterministic ID, idempotent), appends the `*_success` log idempotently, returns a safe summary. The route handler sets the cookie — the orchestrator itself never touches `res`.

Bootstrap (`services/bootstrap.service.ts`, unchanged from M01) never reads `02_USERS` at all, so it structurally cannot leak a complete Gate value to the frontend — confirmed by `bootstrap.service.test.ts`'s existing "never includes plaintext secrets" test, still passing.

## 5. Idempotency and deterministic IDs

Google Sheets has no cross-tab transactions — the design accepts this and makes every individual write idempotent instead of trying to fake atomicity:

- **Session ID = `sess_<flow>_<attemptId>`** (e.g. `sess_gate_abc123`). `createOrReconcileSession` calls the existing M01 `SheetGateway.appendIfAbsent`, so a retry with the same `attemptId` finds and returns the original row rather than creating a second session.
- **Every log ID is deterministic from the operation it records**: `log_gate_success_<attemptId>`, `log_gate_failure_<attemptId>`, `log_gate_ratelimited_<attemptId>` (the attemptId of the specific blocked request), `log_admin_*_<attemptId>` analogously, `log_pageopen_<operationId>`, `log_session_resume_<kind>_<resumeOperationId>`, `log_session_end_<kind>_<sessionId>`, `log_session_expired_<sessionId>`, `log_session_terminated_<sessionId>`.
- **Partial-write reconciliation is proven, not just asserted** (`auth-reconciliation.test.ts`, using a new `FlakyGoogleSheetsClient` test double that can fail a specific numbered call): a Gate login where the session-creation append succeeds but the success-log append then throws returns a 500 to the client, but leaves the session row correctly created. A retry with the **same** `attemptId` finds the existing session (`created: false`), successfully appends the previously-missing log, and returns 200 with the same session data — no duplicate session, no duplicate log, across 3 identical retries.
- **Sheet outage safety**: any Sheets client error (mapped through the existing M01 `toSafeApiError`) always produces a generic `{ok:false, code, message}` body — never a stack trace, Google error body, or credential fragment. Proven with the same flaky-client double.

## 6. Cookie design (`http/cookies.ts`)

Two distinct cookies, `vw_owner_session` and `vw_admin_session`:

- `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when `isProduction()` returns true (default: `resolveEnvironment() === 'production'`, reusing the existing M01 environment detector) — `false` on localhost/emulators, so cookies still work over plain HTTP there.
- `Expires` is always set to the session's exact absolute expiry — never refreshed by a heartbeat, never a session/non-persistent cookie.
- Reading uses a small hand-written `parseCookieHeader` (no new dependency) over `req.headers.cookie`; only ever looks up the two known cookie names.
- **A session ID is never sent in a JSON response** — `SafeSessionSummary` has no `sessionId` field (§3), confirmed by an explicit test asserting the property is absent from every login/resume/heartbeat response body.
- The two cookies fully coexist: logging out one kind's `DELETE` route only clears that kind's cookie and only terminates that kind's session — proven by a test that logs in as both owner and admin, logs out the owner, and confirms the admin session is still resumable and the admin `Set-Cookie` header is never touched.

## 7. Session lifecycle and the rate-limit boundary (documented choice)

**Session resolution** (`session-resolution.service.ts`, `resolveActiveSession`) is the one function behind resume, heartbeat, and the Admin middleware. It always reads `06_SESSIONS` with `{ bypass: true }` — the ordinary 60-second Sheet cache never delays noticing termination or expiry. Order of checks: not-found → terminated (log once, keyed by session ID) → expired-by-status-or-time (transition the row, log once) → kind mismatch → not-active. A session's _kind_ (owner vs Admin) is derived from its own ID prefix (`sess_gate_*` / `sess_admin_*`) rather than a new Sheet column, since M02-B2 doesn't have Living-Bible/blueprint approval to add one; this also avoids an extra `02_USERS` read on every resolution. A kind mismatch — reachable only by manually setting a cookie's value to a session ID that belongs to the other kind — returns the new `SESSION_FORBIDDEN` (403), distinct from the 401 "not authenticated at all" cases; a valid, active owner session presented as the Admin cookie is rejected as 403, not 401 or 200.

**Rate-limit boundary** (`rate-limit.service.ts`, `computeRateLimitDecision` — a pure function with 11 dedicated boundary tests): the spec explicitly allows either of two behaviors for "the request that reaches the maximum failure count" and asks for one to be chosen, documented, and tested at the exact boundary. **Chosen behavior**: the request causing the trailing failure count to _reach_ `maxAttempts` still receives the normal generic 401 (with `remainingAttempts: 0` for UI purposes) — because rate-limit evaluation happens once, at the _start_ of the request, using only failures already recorded _before_ it. The **next** request (whichever one arrives) sees `maxAttempts` trailing failures with no rate-limited marker yet, is blocked, and is the one whose `*_rate_limited` log gets appended. A cooldown, once engaged, is pinned to its _first_ rate-limited marker's timestamp — later blocked attempts during the same window append their own audit log rows (for a complete trail) but never push `cooldownEndsAt` further out, which is what keeps "rate-limit events must not permanently extend cooldown" true. Once now passes that cooldown end, the entire chain (its failures and its cooldown marker) is discarded and counting restarts at zero — proven directly (`rate-limit.service.test.ts`) and end-to-end (`auth-api.test.ts`: 5th Gate failure → 401 not 429; 6th → 429 with `retryAfterSeconds: 10`; a success resets the chain; independent IP/device/flow scopes; Admin's 3-attempt/30-second boundary).

## 8. IP resolution and logging

`http/ip-resolver.ts` returns `req.ip`, which depends entirely on `app.set('trust proxy', 1)` in `app.ts`. **This was deliberately set to `1`, not `true`** — Firebase Hosting → Cloud Functions is exactly one trusted proxy hop; trusting the _whole_ `X-Forwarded-For` chain (`true`) would let a client prepend an arbitrary spoofed address in front of the real one that Google's frontend appends, defeating IP-scoped rate limiting entirely. This is proven by a dedicated test sending `X-Forwarded-For: 203.0.113.1, 203.0.113.200` and asserting the logged IP is `203.0.113.200` (the real, trusted-proxy-appended entry), not the attacker-prependable `203.0.113.1`. No route ever reads `req.body.ip`, `req.body.ip_address`, or any query-string equivalent — proven by a test that sends both fields and asserts neither value is ever logged.

All 11 accepted `entry_event_type` values (from M02-A's `39_VALIDATION_LISTS` seed) are used somewhere in this runtime: `page_open`, `gate_failure`, `gate_success`, `gate_rate_limited`, `admin_failure`, `admin_success`, `admin_rate_limited`, `session_resume`, `session_end`, `session_expired`, `session_terminated`. `EntryLogFields` (`entry-log.service.ts`) has no `digits`/`password`/`cookie`/`authorization` field at all, so it's structurally impossible for a caller to pass one through — confirmed by tests asserting the fixture Gate code and Admin password strings never appear in any response body or logged row.

## 9. Test totals

**281 tests, 25 files, all passing** (`npm run test`):

- `packages/sheet-schema`: 45 tests / 4 files — unchanged from M02-A.
- `apps/functions`: **~215 tests / 19 files** (98 carried over from M02-A + ~117 new): `rate-limit.service.test.ts` (11 — pure boundary logic for both flows, cooldown pinning, chain reset), `cookies.test.ts` (13), `session-resolution.service.test.ts` (8 — required/invalid/terminated/expired/forbidden/ok, expiry never extended, terminated-takes-precedence-over-expired), `auth-api.test.ts` (30 — page-open incl. idempotency/IP-spoof/proxy-IP/multi-hop-spoof-resistance, Gate/Admin validation and success/failure paths, the full rate-limit boundary suite for both flows), `session-api.test.ts` (20 — resume/heartbeat/logout for both kinds, expired/terminated/forbidden, cookie coexistence, Admin middleware), `auth-reconciliation.test.ts` (3 — Sheet outage safety, partial-write reconciliation, triple-retry duplicate-freedom), plus the 12 M02-A/M01 files updated where the protected schema-health route required it (`app.test.ts`).
- `apps/web`: 52 tests / 6 files — `contracts-compile.test.ts` updated for the reshaped access contracts; no other frontend file changed (no Gate/Admin UI was built).

## 10. Security checks performed

- `npm run security:scan` — PASSED, no forbidden credential references in `apps/web/dist`.
- `npm run lint` — 0 errors, 0 warnings (repo-wide).
- Grepped `apps/functions/src` for `console.log|error|warn` — only the pre-existing, unrelated local-dev-server startup line.
- Every login/resume/heartbeat response body was asserted, in tests, to never contain the fixture Gate code (`4821`) or Admin password (`fixture-admin-secret-only`) strings, and to never contain a `sessionId` property.
- `git status` reviewed — only the files listed in §2 changed; nothing unrelated touched; nothing committed.

## 11. Commands run and results

```
npm run format:check   → 14 files initially flagged (new files, pre-format) → npm run format → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (build:libs → functions → web)
npm run test               → PASS, 281/281 (45 sheet-schema + 184 functions + 52 web)
npm run build                → PASS (contracts → sheet-schema → test-fixtures → functions → web)
npm run security:scan          → PASSED, 3 file(s) scanned in apps/web/dist, no forbidden content
```

`npm run test:m01:live`, `npm run preflight:m02` / `npm run seed:m02` (the real-Sheet scripts), and `npm run test:e2e` (Playwright) were **not run**, per instructions.

## 12. Remaining M02-C work (not started)

- Frontend Gate UI (four interactive dials) and Admin login UI.
- Wiring the frontend to the new `/api/access/page-open`, `/api/auth/gate`, `/api/auth/admin`, `/api/session/**` routes (attemptId/operationId generation, resume-on-load, heartbeat interval, logout control).
- Live authentication verification script against the real Sheet (a `test-m02-live-auth`-style script, analogous to `scripts/test-m01-live.mjs`), run manually, never as part of `npm run test`.
- Playwright coverage for the Gate/Admin flows.
- Final `docs/reports/M02_EVIDENCE.md` (this checkpoint is not that).
- Wiring `05_ENTRY_LOGS.event_type` to `39_VALIDATION_LISTS`'s `entry_event_type` controlled list in `packages/sheet-schema` (a M02-A gap noticed while working: the list was seeded, but the column's `controlledList` reference was never added to the registry, so schema-health can't flag an invalid `event_type` value yet). Left alone as out of scope for B2 — noted here rather than fixed silently.

## 13. Confirmations

- **No access value was printed** anywhere in this session — no Gate code, Admin password, session ID, cookie value, or private key appears in any test assertion output, console output, or this report. Every test that touches a real fixture secret (`4821`, `fixture-admin-secret-only`) does so only to assert its _absence_ from a response.
- **No frontend Gate/Admin UI was built** — `apps/web/src` was not touched at all; only `apps/web/tests/contracts-compile.test.ts` changed, to keep it compiling against the reshaped contracts.
- **No live-authentication test against the real Sheet was run**, and no new live-verification script was created.
- **No Playwright test was run or added.**
- **No M03 feature was built** — no localization runtime, asset/icon registry, Drive media gateway, or world/story feature was touched.
- **Nothing was committed** and no `npm audit fix`/dependency changes were made.
