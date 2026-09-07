# M02 — Gate Access, Admin Access, Sessions, IP Logs: Evidence Report

**Milestone:** M02 (complete: M02-A, M02-B2, M02-C)
**Date:** 2026-09-05 (Gate keyboard UX follow-up added 2026-09-06, §6a)
**Scope of this report (M02-C only):** the schema-registry completion fix, the frontend Gate/Admin UI, heartbeats, a live verification script, Playwright coverage, and this evidence report. M02-A (access foundation) and M02-B2 (authentication/session API runtime) are separately documented in `docs/reports/M02_PART_A_CHECKPOINT.md` and `docs/reports/M02_B2_CHECKPOINT.md` and are **not** re-described in full here except where this report needs to reference them.

---

## 0. Preflight (before any code was written)

- **Real Sheet/credential connection:** confirmed via `npm run preflight:m02` — 14/14 checks passed (real credential loads, Sheets API reachable, `veoulla` is the single active owner with a configured 4-digit Gate value, `admin_ahmed` is an active Admin with a configured password, sample rows absent, credential git-ignored). No access value was printed.
- **The seven M02 config values:** reconfirmed via `node scripts/seed-m02-access-config.mjs` (idempotent — reruns without side effects): `created: 0, updated: 0, unchanged: 18`, i.e. all 7 `01_APP_CONFIG` rows and all 11 `39_VALIDATION_LISTS` rows already match the accepted values exactly:

  | Key                              | Value |
  | -------------------------------- | ----- |
  | `owner_session_duration_minutes` | 1440  |
  | `admin_session_duration_minutes` | 120   |
  | `gate_max_attempts`              | 5     |
  | `gate_cooldown_seconds`          | 10    |
  | `admin_max_attempts`             | 3     |
  | `admin_cooldown_seconds`         | 30    |
  | `session_heartbeat_seconds`      | 30    |

- **No blocker was found.** Work proceeded.

## 1. Files changed / created (M02-C only)

**New (frontend):**

- `apps/web/src/services/{clientIds,deviceId,accessApiClient,accessClient}.ts` — client ID generation, anonymous device ID persistence, the low-level fetch wrapper, and typed wrappers for every M02 route.
- `apps/web/src/hooks/{useSessionAccess,usePageOpenLog}.ts` — session resolve/heartbeat/logout state machine; once-per-page-load page-open logging.
- `apps/web/src/features/gate/{GatePage,DigitDial}.tsx` + `.module.css` — the functional prototype Gate.
- `apps/web/src/features/admin/{AdminLoginForm,AdminSchemaHealthView}.tsx` + `AdminLoginForm.module.css` — Admin login form and the (renamed, session-gated) Schema Health view.
- `apps/web/tests/{GatePage,accessApiClient,deviceId,useSessionAccess}.test.ts(x)` — new frontend unit/integration tests.
- `scripts/test-m02-live-auth.mjs` — live authentication verification (§5).
- `scripts/capture-m02-screenshots.mjs` — evidence screenshot capture.
- `tests/e2e/{gate,admin-auth,owner-admin-isolation}.spec.ts` — new Playwright coverage.

**Modified:**

- `packages/sheet-schema/src/tabs/system-config.ts` — wired `05_ENTRY_LOGS.event_type` to the `entry_event_type` controlled list (§2).
- `packages/sheet-schema/tests/registry.test.ts`, `apps/functions/tests/schema-health.service.test.ts` — new tests proving the wiring (§2).
- `apps/web/src/app/{App,AppRoutes}.tsx` — routes `/` to `GatePage`; mounts `usePageOpenLog` once at the app root.
- `apps/web/src/features/admin/AdminPage.tsx` — now a thin session-gated switch (resolving → login form → Schema Health view).
- `apps/web/src/features/admin/AdminPage.module.css` — added the inline logout-link style.
- `apps/web/tests/{AdminPage,routes}.test.tsx`, `apps/web/tests/helpers/mockApi.ts`, `apps/web/tests/setup.ts` — updated for the new auth-gated pages; the mock now tracks per-kind login state statefully so a fresh UI login flows into subsequent resume/heartbeat/schema-health calls the same way a real cookie would.
- `tests/e2e/{mobile-viewport,network-security,route-refresh}.spec.ts` — updated for the new Gate/Admin content and the now-protected schema-health route.
- `package.json` — added `test:m02:live`.
- **(2026-09-06 follow-up, §6a)** `apps/web/src/features/gate/GatePage.tsx`, `apps/web/tests/GatePage.test.tsx`, `tests/e2e/gate.spec.ts` — Gate keyboard UX: type-without-focusing-a-dial, sequential digit advance, Backspace, and gated Enter submission.

**Deleted:**

- `apps/web/src/features/home/{HomePage.tsx,HomePage.module.css}`, `apps/web/tests/HomePage.test.tsx` — the M01 diagnostic Home page, explicitly superseded by the Gate per this milestone's instructions. (`BackendStatus`/`BootstrapSummary`/their clients were left in place, unused by any route — not deleted, since removing working M01-accepted code was not asked for here.)
- `tests/e2e/{home,admin,backend-health}.spec.ts` — superseded by `gate.spec.ts`/`admin-auth.spec.ts`; `backend-health.spec.ts` specifically tested the now-removed Home diagnostic widgets (the underlying API-level checks it duplicated remain covered by `network-security.spec.ts` and unit tests).

## 2. Schema-registry completion fix

`05_ENTRY_LOGS.event_type` is now wired to the `entry_event_type` controlled list (`c('event_type', 'text', { controlledList: 'entry_event_type' })`), completing the M02-A gap noted in the M02-B2 checkpoint. Proven by:

- `packages/sheet-schema/tests/registry.test.ts` — asserts the column definition itself carries `controlledList: 'entry_event_type'`.
- `apps/functions/tests/schema-health.service.test.ts` (3 new tests) — an M02 workbook with all 11 accepted values produces zero `INVALID_CONTROLLED_VALUE` diagnostics; a workbook with one deliberately invalid `event_type` value is flagged; `GOOD_WORKBOOK` (whose `39_VALIDATION_LISTS` has no `entry_event_type` rows at all) is unaffected — proving the check only activates once the list actually exists in a given workbook, so no M01-accepted test's exact healthy/warning counts changed.

## 3. Frontend access runtime

- **Typed API client** (`accessClient.ts`) covers all 9 routes: `pageOpen`, `gateLogin`, `adminLogin`, `resumeSession`, `heartbeatSession`, `logoutSession` (parameterized by `SessionKind`). The low-level transport (`accessApiClient.ts`) always sends `credentials: 'same-origin'` and returns either the typed backend result or a synthetic `{ok:false, code:'NETWORK_ERROR'}` — never throws, never leaks the underlying fetch error text.
- **IDs:** `attemptId`/`operationId`/`resumeOperationId` are `crypto.randomUUID()` values, generated once per logical action (stored in a ref for the duration of that one request) — a page-open's ID is created once per mount and reused if the effect ever re-fires (e.g. a dev double-invoke), which the backend's idempotency guard collapses into one log row regardless.
- **Device ID** (`deviceId.ts`): one anonymous UUID generated once and persisted in `localStorage` under `vw_device_id`; falls back to a fresh per-call ID if `localStorage` throws (private browsing, disabled storage).
- **Nothing sensitive persists longer than the active request:** Gate digits are cleared from React state immediately after every submit (success or failure — see `GatePage.tsx`); the Admin password field is cleared after every submit attempt and never repopulated; no session ID or cookie value is ever read into JS at all — cookies stay HttpOnly and backend-only, and `SafeSessionSummary` (the only session data the frontend ever sees) structurally has no session-ID field.
- **Session resolution on load:** `useSessionAccess(kind)` calls `GET /api/session/{kind}` once on mount, showing a `LoadingState` while resolving, then settles into `authenticated`/`unauthenticated`/`offline`.

## 4. Route matrix

| Method | Route                          | Frontend usage                                                          |
| ------ | ------------------------------ | ----------------------------------------------------------------------- |
| POST   | `/api/access/page-open`        | Once per real page load, from the app root                              |
| POST   | `/api/auth/gate`               | Gate dial submission                                                    |
| POST   | `/api/auth/admin`              | Admin login form submission                                             |
| GET    | `/api/session/owner`           | Resume on Gate page load                                                |
| POST   | `/api/session/owner/heartbeat` | Every 30s while the owner session is authenticated                      |
| DELETE | `/api/session/owner`           | Owner logout button                                                     |
| GET    | `/api/session/admin`           | Resume on Admin page load                                               |
| POST   | `/api/session/admin/heartbeat` | Every 30s while the Admin session is authenticated                      |
| DELETE | `/api/session/admin`           | Admin logout button                                                     |
| GET    | `/api/admin/schema-health`     | Only rendered once `useSessionAccess('admin')` resolves `authenticated` |

All backend behavior behind these routes (validation, rate limiting, idempotency, cookies) is unchanged from M02-B2 — this milestone only adds the frontend that calls them, plus heartbeats.

## 5. Cookie/session lifecycle (frontend-observed)

- Two distinct HttpOnly cookies (`vw_owner_session`, `vw_admin_session`), fully independent — proven live (§7) and via Playwright (`owner-admin-isolation.spec.ts`, credential-gated).
- **Heartbeat** (`useSessionAccess`): starts a 30-second interval only while `status === 'authenticated'`; a `heartbeatInFlight` ref prevents overlapping requests; a network failure during a tick is treated as transient (session stays authenticated, retried next tick) — only an explicit `ok:false` session result transitions to `unauthenticated`. The interval is cleared on unmount, on any non-authenticated status, and implicitly stops once the component gating it (Gate/Admin page) is no longer rendered.
- **Never extends absolute expiry:** heartbeat's only mutation is `last_seen_at` (backend-enforced, proven in M02-B2's `session-api.test.ts` and again live in §7 below).
- **Expired/terminated sessions return the user to the entry screen safely:** any non-`ok` resume or heartbeat result (whatever the specific reason) uniformly transitions the hook to `unauthenticated`, which both `GatePage` and `AdminPage` render as their respective entry screens — no special-casing needed per error code.

## 6. Gate/Admin UI acceptance

- **Four independent digit dials** (`role="spinbutton"`, `aria-valuemin=0`, `aria-valuemax=9`, `aria-valuenow`), each with visible up/down buttons (mouse/touch) and full keyboard support (ArrowUp/ArrowDown wrap 0↔9, Home/End jump to 0/9, typing a digit sets it directly) plus a visible `:focus-visible` outline. Digits are held as a plain number array in state and only ever mapped to strings at the moment of the API call — never combined into a single stored/visible string.
- **Duplicate submissions disabled** while a request is pending (`disabled={pending}` on the whole form).
- **Generic invalid feedback** ("Incorrect code. Please try again.") with `remainingAttempts` shown when the API safely supplies it; a live cooldown countdown (ticking every second from `retryAfterSeconds`) is shown and re-submission is disabled for a 429.
- **On success:** a plain "Access granted / World loading…" placeholder and a logout button — nothing world/M03-shaped is rendered.
- **Refresh resumes the valid owner session** via the cookie (`useSessionAccess`); expired/terminated sessions fall back to the Gate automatically.
- **Admin:** `/admin` resolves the Admin session first; unauthenticated shows a username/masked-password form (`type="password"`) that never repopulates the password after any submit attempt; generic failure/remaining-attempts/cooldown feedback mirrors the Gate; success shows the existing Schema Health view (now gated, with a "Signed in as `<username>`" line and a logout button); `/api/admin/schema-health` itself remains inaccessible without a valid Admin session (backend-enforced, unchanged from M02-B2); direct refresh on `/admin` works (SPA rewrite, proven by `route-refresh.spec.ts`); an owner login never satisfies Admin access and vice versa (backend-enforced `SESSION_FORBIDDEN`/cookie-name separation, proven live in §7 and in `owner-admin-isolation.spec.ts`).

## 6a. Follow-up (2026-09-06): Gate keyboard UX — type without clicking a dial

A focused, keyboard-only UX improvement to the Gate, requested and scoped separately from the rest of M02-C above. Ahmed had already manually verified correct Gate login, Admin login, and both authenticated states open successfully before this change; this follow-up touches only Gate keyboard handling, not authentication logic, Admin, or the backend.

**Behavior added** (`apps/web/src/features/gate/GatePage.tsx`):

- The Gate's outer container is now a keyboard landing pad (`ref` + `tabIndex={-1}` + `data-testid="gate-root"`) that receives focus automatically via `useEffect` the moment `useSessionAccess` resolves to `unauthenticated` — first load once session resolution finishes, and again after logout — so digits can be typed immediately with no click or Tab needed.
- A new `filledCount` state (0–4) tracks how many digits have been explicitly typed through this global flow, kept entirely separate from any single dial's displayed value and never combined into a string anywhere (still true only at the moment of the API call, unchanged from before).
- **Digits 0–9:** the container's `onKeyDown` fills `digits[filledCount]` and advances `filledCount`; input is ignored once `filledCount` reaches 4 (no auto-submit).
- **Backspace:** decrements `filledCount` and clears that position back to `0`; a no-op when `filledCount` is already `0`.
- **Enter:** submits only when `filledCount === 4`; otherwise it is swallowed (`preventDefault`) and does nothing. The existing "Enter" **button** click path is untouched and still submits whatever `digits` currently holds regardless of `filledCount`, preserving every prior test/behavior that clicks the button directly.
- **Guarding:** the whole handler no-ops whenever `disabled` (`pending || rateLimited`) is true, so a pending request or an active cooldown cannot be bypassed by the keyboard path either.
- **No double-handling:** the handler first checks `event.defaultPrevented` — an individual `DigitDial`'s own ArrowUp/ArrowDown/Home/End/direct-digit handling (unchanged, in `DigitDial.tsx`) always runs first (event bubbles child→parent) and calls `preventDefault()`, so the container never reprocesses a key a focused dial already handled. This is what keeps the pre-existing "focus one dial, type a digit, only that dial changes" behavior intact side-by-side with the new global sequential flow.
- **Focus restored after every submit attempt** that keeps the user on the unauthenticated screen (offline, invalid, rate-limited) — `containerRef.current?.focus()` — so typing works immediately again without another click, and digits/`filledCount` are both reset to their initial state right after every submit attempt (never retained).
- Nothing in `DigitDial.tsx` or any Admin/backend file was changed.

**Tests added** (`apps/web/tests/GatePage.test.tsx`, 9 new — file went from 9 to 19 `it`s per §9):

- Gate container receives focus automatically once session resolution completes, with no dial clicked.
- Four digits typed with no click/focus fill all four dials in order.
- A fifth digit is ignored (no fifth position, no auto-submit) once four are filled.
- Backspace moves the active position backward and allows correcting a digit; repeated Backspace on an empty entry is a safe no-op.
- Enter with fewer than four digits does not call `/api/auth/gate`.
- Enter after exactly four digits submits exactly once.
- Focus is restored after an invalid-code error so typing works immediately again.
- A second Enter press while the first request is still pending does not trigger a duplicate `/api/auth/gate` call (verified with a deliberately delayed fetch mock).
- Digit/Enter input is ignored for the duration of an active rate-limit cooldown.

All pre-existing Gate tests (individual-dial ArrowUp/Home/End/digit-typing, mouse/touch dial buttons, generic invalid feedback, cooldown display, session resume, logout) pass unmodified.

**Playwright** (`tests/e2e/gate.spec.ts`): 3 new tests added to the existing unauthenticated-Gate describe block — typing four digits with no click/focus, Backspace-correct-then-Enter-with-only-two-digits-does-not-submit, and Enter-after-four-typed-digits-submits. Run against the real Sheet via the local emulator, `desktop-chromium` project only (the "relevant Gate tests" for this specific keyboard change, not a full-suite/mobile rerun): **7 passed, 1 flaky-then-passed-on-retry, 1 skipped** (the pre-existing credential-gated successful-login test, same reason as §7/§8 — `E2E_GATE_CODE` not set in this session). The one flake was the pre-existing first test in the file (`shows the Gate with four digit dials...`, unrelated to keyboard code) timing out on a cold emulator start and passing on the config's existing `retries: 1` — the same documented class of flake as §8, not a regression from this change. All 3 new keyboard tests passed on their first attempt.

## 7. Live verification (`npm run test:m02:live`)

Runs the real Express app (`createApp()`, real credential-backed gateway) on an ephemeral local port and exercises it over real HTTP against the real Sheet — never a fake gateway. Never prints a Gate code, Admin password, session ID, or cookie value. The real Gate code / Admin password are read only from optional `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD` env vars (never set in this session, since Claude must never obtain or be given these values) — every check that needs them reports **SKIP**, never a fabricated PASS.

**Final run: 27 passed, 0 failed, 8 skipped.**

```
=== 1. Real Sheet connection and app startup ===        PASS ×2
=== 2. Page-open logging and idempotency ===             PASS ×2
=== 3. Gate failure path ===                              PASS ×3
=== 4. Admin failure path ===                             PASS ×2
=== 5. Protected schema-health rejects w/o session ===    PASS ×1
=== 6. Gate rate-limit boundary ===                       PASS ×9 (5 failures, boundary, 429 + cooldown=10)
=== 7. Admin rate-limit boundary ===                      PASS ×6 (3 failures, boundary, 429 + cooldown=30)
=== 8. IP and device logging ===                          PASS ×2
=== 9–11. Success-path / cookie separation ===            SKIP ×8 (no E2E_GATE_CODE / E2E_ADMIN_PASSWORD set)
```

**A real, live Google Sheets API quota hiccup was caught and handled correctly**, not hidden: this script's own app bypasses the Sheet read cache for every rate-limit/config check by design (correctness over speed), which occasionally trips Google's own short-window API quota — indistinguishable from this app's own 429 by HTTP status alone, but distinguishable by response `code` (`SHEET_RATE_LIMITED` vs. this app's `RATE_LIMITED`). The script's `fetchApi()` helper retries only the former with backoff; one such transient retry was observed and logged during the final run (`(retrying after a transient SHEET_RATE_LIMITED from the real Google Sheets API…)`), and the run still completed with 27/27 passing — this is direct, live evidence that the retry logic works, not a hidden failure.

**Sanitized log examples observed in the real Sheet during this work** (from `05_ENTRY_LOGS`; no secret column is shown or was read):

| timestamp                | event_type    | ip_address    | device_id                      |
| ------------------------ | ------------- | ------------- | ------------------------------ |
| 2026-09-05T06:04:34.201Z | admin_failure | 203.0.113.211 | `live_device_adminratelimit_…` |
| 2026-09-05T06:04:46.125Z | admin_failure | 203.0.113.211 | `live_device_adminratelimit_…` |

Every session this script created was explicitly terminated before it exited (none was left dangling), and no row was ever deleted or edited — only appended.

## 8. Playwright (`npm run test:e2e`)

Runs against the real Sheet via the local Firebase Hosting + Functions emulators (unchanged architecture from M01). Two full runs were executed; the second (clean) run:

**33 passed, 1 flaky (passed on its automatic retry), 6 skipped.**

- **Skipped (6):** the three credential-gated tests in `gate.spec.ts`, `admin-auth.spec.ts`, and `owner-admin-isolation.spec.ts` × 2 projects (desktop/mobile-chromium) — each requires `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD`, not set in this session for the same reason as §7. Ahmed can run `npm run test:e2e` locally with those env vars exported (never committed, never shared with Claude) to exercise the full successful-login, refresh-resume, logout, and owner/Admin-isolation scenarios end-to-end.
- **Flaky (1):** `admin-auth.spec.ts`'s very first test timed out once, then passed on the existing `retries: 1` config. This is the **same class of flake M01's own evidence report already documented and accepted** ("Cold-start Playwright flake: the very first live network call of the whole Playwright run occasionally exceeds the 15s expect timeout — Functions emulator cold start + first real Google API round trip"), now manifesting on the new first test instead of the old `home.spec.ts` one. Not a regression.
- **A quota-interaction finding, resolved by design change:** an earlier full run (with a since-removed `gate-cooldown.spec.ts` that triggered 6 real login attempts to display a live cooldown) caused collateral flakiness elsewhere in the suite (`network-security.spec.ts`'s bootstrap check, which internally computes full schema health across all 42 tabs) via cumulative Google Sheets API quota pressure. Removing that one expensive test — whose scenario is already thoroughly proven by `GatePage.test.tsx`'s mocked cooldown-display unit test and by §7's dedicated live rate-limit-boundary section — eliminated the collateral flakiness entirely on rerun. This is documented here rather than silently worked around: **"cooldown display using controlled fixtures where practical" was judged, after direct evidence, not practical as a live Playwright trigger without destabilizing the rest of the suite**, so it is covered by the mocked frontend test and the live backend script instead.

Coverage delivered: initial Gate (desktop+mobile), keyboard dial interaction, pointer dial interaction, invalid Gate feedback, initial Admin login form (desktop+mobile), Admin invalid-credentials feedback (password never repopulated), protected Schema Health rejects without a session, direct `/admin` and `/` refresh, network-security boundary (including the two new auth endpoints), and (credential-gated) successful owner login + refresh-resume + logout, successful Admin login + refresh + logout, and full owner/Admin isolation.

## 9. Test totals (no contradictory counts)

**As of the 2026-09-06 keyboard follow-up: 333 unit/integration tests, 32 files, all passing** (`npm run test`): 46 `packages/sheet-schema` (4 files) + 187 `apps/functions` (19 files) + 100 `apps/web` (9 files). Up from this report's original 323 (+10, all in `GatePage.test.tsx`, which went from 9 to 19 `it`s — see §6a for exactly which 9 cases were added). No other file's count changed.

For reference, the original 2026-09-05 M02-C total (before the keyboard follow-up) was 323: 46 `packages/sheet-schema` (4 files) + 187 `apps/functions` (19 files) + 90 `apps/web` (9 files), itself up from M02-B2's 281 (+42: 1 sheet-schema registry test, 2 functions schema-health tests, and 39 new/updated web tests across `GatePage.test.tsx` (9), `AdminPage.test.tsx` (8, rewritten), `accessApiClient.test.ts` (7), `useSessionAccess.test.ts` (5), `deviceId.test.ts` (3), `routes.test.tsx` (3, rewritten), plus `contracts-compile`/`import-boundary`/`healthClient` unchanged).

**Live verification:** 27 passed / 0 failed / 8 skipped (§7) — unaffected by the keyboard follow-up, not rerun on 2026-09-06 since no backend/session code changed.
**Playwright, original 2026-09-05 full suite:** 33 passed / 1 flaky-then-passed / 6 skipped, 0 hard failures (§8).
**Playwright, 2026-09-06 keyboard follow-up (scoped rerun — `gate.spec.ts`, `desktop-chromium` only, see §6a):** 7 passed / 1 flaky-then-passed-on-retry / 1 skipped, 0 hard failures.

## 10. Commands run and results

Original 2026-09-05 M02-C run:

```text
npm run format:check    → PASS (after npm run format)
npm run lint             → PASS, 0 errors, 0 warnings
npm run typecheck         → PASS
npm run test                → PASS, 323/323
npm run build                 → PASS
npm run security:scan           → PASSED, no forbidden content in apps/web/dist
npm run test:m02:live             → PASSED, 27/27 (8 skip, no secret printed)
npm run test:e2e                    → 33 passed, 1 flaky (passed on retry), 6 skipped
```

2026-09-06 Gate keyboard UX follow-up (§6a) — rerun after the change:

```text
npx prettier --check <2 changed files>            → PASS
npm run lint                                       → PASS, 0 errors, 0 warnings
npm run typecheck                                  → PASS (full monorepo)
npm run test                                       → PASS, 333/333 (46 + 187 + 100)
npm run build                                      → PASS
npm run security:scan                              → PASSED, no forbidden content in apps/web/dist
npx playwright test tests/e2e/gate.spec.ts --project=desktop-chromium
                                                    → 7 passed, 1 flaky-then-passed, 1 skipped
```

`npm run test:m02:live` was not rerun for this follow-up — no backend, session, or authentication logic changed, only Gate-page client-side keyboard handling.

## 11. Screenshots

Captured via `node scripts/capture-m02-screenshots.mjs` against the local emulator, saved to `docs/reports/M02/`:

- `gate-desktop.png` / `gate-mobile.png` — the Gate at rest, all four dials at `0`.
- `admin-login-desktop.png` / `admin-login-mobile.png` — the Admin login form, both fields empty.

**Not captured:** `owner-access-granted-*.png` and `admin-schema-health-*.png` require the real Gate code / Admin password (`E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD`) to reach those states, and Claude never has and must never request those values. The capture script supports both automatically the moment Ahmed sets those two env vars locally and reruns it — it will never fabricate a screenshot of a state it couldn't actually reach. No screenshot in this set shows a Gate digit combination, password, session value, cookie, private key, or credential — confirmed by visual review of all four images before this report was written.

## 12. Known limitations

- The two credential-gated screenshots and the 6 credential-gated Playwright tests / 8 credential-gated live-script checks are not exercised in this session, for the reason above — this is a structural consequence of the security requirement that Claude never see the real Gate code or Admin password, not a gap in what was built.
- Google Sheets API quota pressure is a real, observed characteristic of this environment when many rate-limit-boundary or schema-health-computing requests run back-to-back (§7, §8) — mitigated with retry/backoff in the live script and by keeping Playwright's own real-API call volume reasonable; not a defect in the M02 application code itself, which behaved correctly in every case once the transient infrastructure condition cleared.
- `BackendStatus`/`BootstrapSummary` (the M01 Home-page diagnostic widgets) and their client/service files remain in the repository, unused by any route, since deleting working M01-accepted code was not asked for in this milestone.
- The M02-A gap noted in the M02-B2 checkpoint (schema-registry wiring for `entry_event_type`) is now fixed (§2); no other gap was carried forward.

## 13. Confirmations

- **No M03 feature was started.** No localization runtime, asset/icon registry, Drive media gateway, world/story feature, or any content beyond the Gate/Admin auth UI and its supporting plumbing was touched. This holds for the 2026-09-06 keyboard follow-up too — it touched only `GatePage.tsx`'s keyboard handling, its unit tests, and `gate.spec.ts`; no Admin UI, no backend code, no M03 work.
- **Nothing was committed.** `git status` at the end of this session shows only the modified/new/deleted files listed in §1 — no commit was made at any point in M02-C, including the 2026-09-06 follow-up.
- **No real Gate code, Admin password, session ID, cookie value, private key, or Google credential was printed, screenshotted, or otherwise exposed** anywhere in this session — every place a real secret could appear was either read through a masked/status-only check (§0, §7) or gated behind an environment variable Claude never set and must never request.
