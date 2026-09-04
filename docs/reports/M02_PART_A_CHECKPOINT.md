# M02-A — Access Foundation Checkpoint

**Milestone:** M02-A (Part A of the approved M02 — Gate Access, Admin Access, Sessions, IP Logs)
**Date:** 2026-09-04
**Scope:** Safe preflight against the live Sheet, git build-output cleanup, an idempotent M02 access-configuration seed run against the live Sheet, M02 access/session contracts, network-free M02 test fixtures, a backend-only typed access-configuration loader, and focused tests. **No authentication backend, frontend Gate, Admin login, sessions runtime, live authentication tests, Playwright, or M03 feature was built.**

---

## 1. Sanitized preflight result

All 14 checks passed against the real Google Sheet (`npm run preflight:m02`, `scripts/test-m02-preflight.mjs`). **No Gate code or Admin password value was printed at any point** — only configured/not-configured status.

| #   | Check                                                     | Result           |
| --- | --------------------------------------------------------- | ---------------- |
| 1   | Real Google credential is present and loads               | ✅               |
| 2   | Sheets API metadata call succeeds                         | ✅               |
| 3   | Exactly one active owner exists                           | ✅               |
| 4   | The single active owner is `veoulla`                      | ✅               |
| 5   | Gate value is configured (present, not a placeholder)     | ✅ (status only) |
| 6   | Gate value is exactly four digits                         | ✅ (status only) |
| 7   | `admin_ahmed` row exists                                  | ✅               |
| 8   | `admin_ahmed` has role `admin`                            | ✅               |
| 9   | `admin_ahmed` is active                                   | ✅               |
| 10  | Admin password is configured (present, not a placeholder) | ✅ (status only) |
| 11  | `log_sample_001` is absent from `05_ENTRY_LOGS`           | ✅               |
| 12  | `log_sample_002` is absent from `05_ENTRY_LOGS`           | ✅               |
| 13  | `sess_sample_001` is absent from `06_SESSIONS`            | ✅               |
| 14  | Google credential file is ignored by Git                  | ✅               |

**14 passed, 0 failed.** Preflight was green, so no blocker was raised and work proceeded.

## 2. Git build-output cleanup result

`apps/functions/lib/` was confirmed as the generated Functions TypeScript output (`apps/functions/tsconfig.json` → `outDir: "./lib"`; `apps/functions/package.json` → `main: "lib/index.js"`) before touching it.

- Ran `git rm -r --cached apps/functions/lib` — 20 previously-tracked files removed **from the Git index only** (all show as `D` in `git status`, i.e. staged deletions from the index).
- Verified the local files were **not** deleted: `ls apps/functions/lib/` still shows the compiled output on disk after the command.
- Verified `git ls-files apps/functions/lib` now returns 0 entries.
- Confirmed `.gitignore` already excludes `lib/` (added during M01, line 8 of the "Build outputs" block) — a future `npm run build` will not cause these files to reappear in `git status`.
- No history was rewritten. **Nothing was committed** — the staged removal is left for Ahmed to commit alongside (or separately from) the rest of this checkpoint's changes, per instructions not to commit in M02-A.

## 3. Idempotent M02 Sheet configuration — exact non-secret values written

Ran `npm run seed:m02` (`scripts/seed-m02-access-config.mjs`) against the live Sheet. **Never reads or writes `02_USERS`** — the Gate code and Admin password were untouched by this step.

### 3a. `01_APP_CONFIG` rows upserted (keyed by `config_key`)

| config_key                       | value | value_type | enabled | restart_required | description                                                                                                                    |
| -------------------------------- | ----- | ---------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `owner_session_duration_minutes` | 1440  | integer    | TRUE    | FALSE            | Owner (Veoulla) Gate session absolute expiry, in minutes.                                                                      |
| `admin_session_duration_minutes` | 120   | integer    | TRUE    | FALSE            | Admin session absolute expiry, in minutes.                                                                                     |
| `gate_max_attempts`              | 5     | integer    | TRUE    | FALSE            | Consecutive failed Gate attempts allowed before the cooldown engages.                                                          |
| `gate_cooldown_seconds`          | 10    | integer    | TRUE    | FALSE            | Cooldown duration, in seconds, after gate_max_attempts consecutive failures.                                                   |
| `admin_max_attempts`             | 3     | integer    | TRUE    | FALSE            | Consecutive failed Admin login attempts allowed before the cooldown engages.                                                   |
| `admin_cooldown_seconds`         | 30    | integer    | TRUE    | FALSE            | Cooldown duration, in seconds, after admin_max_attempts consecutive failures.                                                  |
| `session_heartbeat_seconds`      | 30    | integer    | TRUE    | FALSE            | Expected client heartbeat interval, in seconds; heartbeat keeps a session marked active but never extends its absolute expiry. |

### 3b. `39_VALIDATION_LISTS` — `entry_event_type` values added (all enabled, sequential `sort_order` 1–11)

`page_open`, `gate_failure`, `gate_success`, `gate_rate_limited`, `admin_failure`, `admin_success`, `admin_rate_limited`, `session_resume`, `session_end`, `session_expired`, `session_terminated`.

### 3c. Idempotency proof (live, not simulated)

- **First run** (`npm run seed:m02`): `created: 18, updated: 0, unchanged: 0` — all 7 config rows + 11 validation-list values created.
- **Second run** (`node scripts/seed-m02-access-config.mjs`, no rebuild): `created: 0, updated: 0, unchanged: 18` — rerunning created zero duplicate rows.
- **Third run**, after refactoring the script to call the shared, unit-tested `seedAccessAppConfig` / `seedEntryEventTypeValidationList` functions instead of inlined logic: `created: 0, updated: 0, unchanged: 18` again — confirms the refactor preserved identical behavior against the live Sheet.
- The same upsert/insert-if-absent logic is also proven against a fake in-memory Sheet client in `apps/functions/tests/access-config-seed.service.test.ts` (§7).

The Gate code was not modified; the Admin password was not modified — the seed script's only tab interactions are `01_APP_CONFIG` and `39_VALIDATION_LISTS`, and `access-config-seed.service.test.ts` includes a dedicated test asserting `02_USERS` is never read or written by the config-seed function.

## 4. Contracts added (`packages/contracts/src/access.ts`, `api-error.ts`)

New types: `SessionKind`, `SessionStatus`, `SafeSessionSummary`, `RateLimitState`, `RateLimitedResponse`, `GateLoginRequest`/`GateLoginSuccess`/`GateLoginFailure`/`GateLoginResult`, `AdminLoginRequest`/`AdminLoginSuccess`/`AdminLoginFailure`/`AdminLoginResult`, `SessionResumeRequest`/`SessionLifecycleFailure`/`SessionResumeResult`, `SessionHeartbeatRequest`/`SessionHeartbeatResult`, `SessionLogoutRequest`/`SessionLogoutResult`, `PageOpenEvent`/`PageOpenResult`.

New safe error codes added to `ApiErrorCode` (as a new `AccessErrorCode` union): `INVALID_GATE_CODE`, `INVALID_ADMIN_CREDENTIALS`, `RATE_LIMITED`, `SESSION_REQUIRED`, `SESSION_EXPIRED`, `SESSION_TERMINATED`, `SESSION_INVALID`, `ACCESS_CONFIG_INVALID`, `ACCESS_SERVICE_UNAVAILABLE`. `apps/functions/src/errors/app-error.ts`'s `httpStatusForCode` was extended to map each of these to a real HTTP status (401 for the four session/credential codes, 429 for rate-limited, 500/503 for the two config/service codes) — infrastructure only, no route uses them yet.

None of these types carry a Sheet access-column name, the current Gate value, the Admin password, Google credentials, a raw Sheet row, a private key, or any secret value — confirmed by `packages/contracts` compiling standalone and by `apps/web/tests/contracts-compile.test.ts`'s new assertions (`Object.keys(session)` never contains `gateCode`/`password`).

## 5. M02 fixtures added (`packages/test-fixtures/src/m02-access-fixtures.ts`)

Network-free, fake-only data, never Ahmed's real values:

- `M02_FAKE_GATE_CODE = '4821'` (a different four-digit fixture value from M01's `'1234'`, to keep the two fixture sets visibly distinguishable).
- `M02_FAKE_ADMIN_PASSWORD = 'fixture-admin-secret-only'`.
- Two distinct `02_USERS` rows (`owner_fixture` role `owner`, `admin_fixture` role `admin`) — matching the real Sheet's two-row shape, unlike M01's `GOOD_WORKBOOK` which combined both on one row.
- `06_SESSIONS`: one `active`, one `expired`, one `terminated` session.
- `05_ENTRY_LOGS`: `gate_success`, `gate_failure`, `admin_success`, `admin_failure` logs, plus a 5-attempt `gate_failure` sequence followed by one `gate_rate_limited` log (matching the accepted `gate_max_attempts = 5`).
- `M02_APP_CONFIG_ROWS` / `M02_ACCEPTED_ACCESS_CONFIG` / `M02_VALIDATION_LISTS_ROWS` mirror the exact values seeded into the live Sheet in §3.
- `buildM02Workbook()` layers all of the above onto a cloned `GOOD_WORKBOOK` for tests that need a full gateway; documented as unsuitable for full schema-health tests since replacing `02_USERS` drops the `veoulla` id some M01 relationship checks expect.

**A real bug was found and fixed during this work:** the first version of `buildM02Workbook()` spread `M02_APP_CONFIG_ROWS`/`M02_VALIDATION_LISTS_ROWS` by reference (`.slice(1)`) instead of deep-cloning them, so a test that mutated a returned workbook's row in place permanently corrupted the shared fixture module for every subsequent test in the run. Caught by `access-config.service.test.ts`'s "never exposes..." test unexpectedly failing with a stale mutated value from an earlier test. Fixed by wrapping both spreads in `structuredClone(...)`. Re-ran the full suite after the fix — all 195 tests pass, including when run in the full-suite order that originally exposed the bug.

## 6. Config parser/service foundation (`apps/functions/src/services/access-config.service.ts`)

`loadAccessConfig(gateway, options?): Promise<AccessConfig>` — backend-only, typed, validates each of the 7 accepted keys is present, enabled, not duplicated, and a positive integer; throws `AppError('ACCESS_CONFIG_INVALID', …)` otherwise. **Does not implement login.** Never reads `02_USERS`, so it structurally cannot expose the Gate code or Admin password — confirmed by a dedicated test asserting the returned object's keys are exactly the 7 `AccessConfig` fields and the serialized JSON never contains the fixture Gate code or Admin password strings.

## 7. Files changed / created

**New:**

- `apps/functions/src/services/access-config.service.ts`
- `apps/functions/src/services/access-config-seed.service.ts`
- `apps/functions/tests/access-config.service.test.ts`
- `apps/functions/tests/access-config-seed.service.test.ts`
- `apps/functions/tests/m02-fixtures.test.ts`
- `packages/contracts/src/access.ts`
- `packages/test-fixtures/src/m02-access-fixtures.ts`
- `scripts/test-m02-preflight.mjs`
- `scripts/seed-m02-access-config.mjs`
- `docs/reports/M02_PART_A_CHECKPOINT.md` (this file)

**Modified:**

- `apps/functions/src/errors/app-error.ts` — HTTP status mapping for the 9 new access error codes.
- `packages/contracts/src/api-error.ts` — `AccessErrorCode` union added to `ApiErrorCode`.
- `packages/contracts/src/index.ts` — new type exports.
- `packages/test-fixtures/src/index.ts` — new fixture exports.
- `apps/web/tests/contracts-compile.test.ts` — compile-time + runtime assertions for the new access contracts.
- `package.json` — added `preflight:m02` and `seed:m02` scripts.

**Git index only (no working-tree file deletion, nothing committed):**

- `apps/functions/lib/**` (20 files) untracked per §2.

## 8. Test totals

**195 tests, 23 files, all passing** (`npm run test`):

- `packages/sheet-schema`: 45 tests / 4 files (unchanged from M01).
- `apps/functions`: **98 tests / 13 files** (74 in M01 + 24 new): `access-config.service.test.ts` (9 — exact accepted parsing, missing key, duplicate key, negative value, non-integer value, zero/out-of-range value, disabled-row-treated-as-missing, real `AppError` instance, no Gate code/Admin password/02_USERS field exposed), `access-config-seed.service.test.ts` (8 — full creation from empty, idempotent rerun, no duplicate `config_key` rows across 3 runs, drift-correcting update without duplication, `02_USERS` never touched, validation-list full creation, idempotent rerun with no duplicate `list_name|value` pairs, every value enabled with sequential sort order), `m02-fixtures.test.ts` (7 — fake-value sanity, `GOOD_WORKBOOK` non-mutation, per-call independence, all three session statuses present, owner/Admin modeled as distinct rows, exact row/value counts).
- `apps/web`: **52 tests / 6 files** (47 in M01 + 5 new access-contract compile/runtime checks in `contracts-compile.test.ts`; `import-boundary.test.ts`'s 32 dynamically-generated tests already cover every current frontend source file, none of which changed).

## 9. Commands run and results

```
npm run preflight:m02   → PASSED, 14/14 (live Sheet; no access value printed)
npm run seed:m02        → PASSED, 1st run created 18, 2nd+3rd runs unchanged 18 (live Sheet)
npm run format:check    → 5 files initially flagged (new files, pre-format) → npm run format → PASS
npm run lint             → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (build:libs → functions → web)
npm run test              → PASS, 195/195 (45 sheet-schema + 98 functions + 52 web)
npm run build              → PASS (contracts → sheet-schema → test-fixtures → functions → web)
npm run security:scan       → PASSED, 3 file(s) scanned in apps/web/dist, no forbidden content
```

Playwright (`npm run test:e2e`) was **not run**, per instructions.

## 10. Remaining M02-B / M02-C work (not started)

- Gate login API (four-dial code verification against the real `veoulla` Gate value) and its rate-limiting/cooldown enforcement.
- Admin login API (against `admin_ahmed`'s password) and its rate-limiting/cooldown enforcement.
- Opaque server-created session issuance, resume, heartbeat, and logout endpoints; `06_SESSIONS` writes.
- Server-side IP capture and append-only `05_ENTRY_LOGS` writes for `page_open`, Gate/Admin success/failure, rate-limited, and session resume/end/expired/terminated events.
- Frontend Gate UI, Admin login UI, and any session-aware routing.
- Live authentication integration tests and any new Playwright coverage for the above.
- Committing the changes in this checkpoint (explicitly deferred — nothing was committed).

## 11. Confirmations

- **No real access value was printed** at any point in this session — preflight (§1) and the seed script (§3) only ever report configured/not-configured status or non-secret configuration keys/values; the Gate code and Admin password strings never appear in any command output, test assertion output, or this report.
- **No M02 runtime authentication was built**: no Gate-code verification endpoint, no Admin-login endpoint, no session issuance/resume/heartbeat/logout endpoint, and no rate-limiting enforcement exist yet — `loadAccessConfig` only loads and validates configuration values.
- **No M03+ feature was built**: no localization runtime, asset/icon registry, Drive media gateway, or any world/story feature was touched.
- `02_USERS` (the Gate code / Admin password tab) was never modified by the seed script or any other change in this session — proven by a dedicated unit test (§8) and by the preflight/seed scripts' own scope (§1, §3).
