# Phase 3 technical closure — evidence report

**Date:** 2026-09-22. **Scope:** Ahmed's same-day authorization to continue Veoulla's World toward
technical completion. **No commit, push, merge, or deploy was performed.** The real owner's (`veoulla`)
rows were never read or written by anything in this pass; every live check below used a freshly
generated, isolated user id. The working tree already held all Phase 1/2 and the manual-journey-repair/
review-corrections work uncommitted from earlier sessions — none of it was reverted, deleted, or
reformatted; this report only describes what this session itself added or changed. Later milestones
(M15 Gemini, M16 birthday event, M18 deployment) were **not implemented** — see
`docs/plans/TECHNICAL_CLOSURE.md` §0 for exactly why, with the specific Living Bible/CLAUDE.md rule each
is blocked on.

Full scope reasoning, the closure checklist, and item-by-item status live in
`docs/plans/TECHNICAL_CLOSURE.md`. This report is the evidence behind it: commands run, exact results,
and the manual review checklist.

## 1. What this session changed

**Performance (`docs/plans/TECHNICAL_CLOSURE.md` §2):**

- `apps/functions/src/repositories/sheet-gateway.ts` — `getRawTab`'s bypass-read freshness window now
  honors a caller's own `options.maxAgeMs` instead of a hard-coded 2.5 s; `updateByPrimaryKey`/
  `appendRow`/`appendRowsIfAbsent` now patch the cached tab copy in place (`writeThroughRow` /
  `writeThroughAppend`) instead of invalidating it, so a same-process follow-up read sees the just-
  written value without a second upstream round trip.
- `apps/functions/tests/sheet-gateway.test.ts` — the one test that asserted the old "a write forces the
  next bypass read upstream" behavior was rewritten to assert the new, intended one; two new tests cover
  the `maxAgeMs` fix and the write-through behavior directly.

**Achievements display (player-facing) — `docs/plans/TECHNICAL_CLOSURE.md` §3:**

- `apps/functions/src/services/player-achievements.service.ts` — new `getPlayerAchievementViews`: joins
  `23_ACHIEVEMENTS` (catalog) with `26_PLAYER_ACHIEV` (per-player progress), resolves title/description
  via `08_UI_TEXT` (Sheet-first, English fallback) and the icon via `09_ICONS`→`10_ASSETS`, and hides a
  still-locked secret achievement's title/description/icon/points entirely.
- `packages/contracts/src/world.ts` — new `PlayerAchievementView` type. `packages/contracts/src/
world-ui-text.ts` — new `achievements_*`/`achievement_*` five-language interface labels.
- `apps/functions/src/api/player.ts` + `apps/functions/src/app.ts` — new `GET /api/player/achievements`
  (owner-session-protected, locale-aware).
- `apps/web/src/services/playerClient.ts` — `fetchPlayerAchievements`. `apps/web/src/features/world/
AchievementsPanel.tsx` — new player-facing panel (loading/error/empty/populated states), opened from a
  new HUD button in `apps/web/src/features/world/WorldExperience.tsx` (`apps/web/src/features/world/
world.module.css` carries its styling).

**Admin panel — `docs/plans/TECHNICAL_CLOSURE.md` §4:**

- `apps/functions/src/services/admin-panel.service.ts` — `getAdminDashboard` (authoritative time,
  Sheet-health summary, active `06_SESSIONS` count, last 20 `05_ENTRY_LOGS` rows, per-tab cache age),
  `queryAdminLogs` (filtered/paginated, read-only), `inspectPlayer` (character/progress/keys/
  achievements/scores/messages/raw world-state docs for one user id).
- `packages/contracts/src/admin.ts` — the response types for all three.
- `apps/functions/src/api/admin-panel.ts` + `apps/functions/src/app.ts` — `GET /api/admin/dashboard`,
  `GET /api/admin/logs`, `GET /api/admin/players/:userId`, all behind the existing `requireAdmin`
  middleware.
- `apps/web/src/services/adminPanelClient.ts` and three new views (`AdminDashboardView.tsx`,
  `AdminLogsView.tsx`, `AdminPlayerInspectorView.tsx`, sharing a new `AdminTable.module.css`).
  `apps/web/src/features/admin/AdminPage.tsx` now shows a tabbed shell (Dashboard / Schema Health /
  Entry Logs / Players) instead of landing straight on Schema Health; `AdminSchemaHealthView.tsx` gained
  an `embedded` prop so it no longer duplicates the shell's own heading/logout when nested under a tab.

**Not built, and why (full reasoning in `docs/plans/TECHNICAL_CLOSURE.md` §1/§7):** Admin feature-flag/
forced-phase/time-override/active-codes controls (nothing exists yet for them to control — M15/M16
blocked); a Sheet deep link or in-app row editing (`apps/functions/src/config/resource-config.ts`'s own
existing comment says the spreadsheet id must never be exposed over the API — this pass found and
respected that rule rather than overriding it); write-batching multiple `37_CHARACTER_STATE` writes of
one action into one request (would need a new cross-mutex-key gateway primitive — flagged as a follow-
up, not attempted under this pass's time budget).

## 2. Commands run and results

Run once, in this order, after implementation (`apps/functions` rebuilt again before the live script,
per §4 below):

| Command                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | **PASS** — `tsc` clean across `packages/contracts`, `packages/sheet-schema`, `packages/test-fixtures`, `apps/functions`, `apps/web`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `npm run lint`          | **PASS** — 0 errors, 0 warnings (`eslint .`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `npm run test`          | **PASS — 992 tests**: 46 sheet-schema + 552 functions (50 files) + 394 web (36 files)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run build`         | **PASS** — libs + functions + web (Vite bundle: 363.77 kB JS / 52.51 kB CSS, gzip 118.49 kB / 11.14 kB)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npm run security:scan` | **PASS** — 3 files scanned in `apps/web/dist`, no forbidden credential references                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm run format:check`  | **4 pre-existing files flagged, none touched this session**: `docs/reports/JOURNEY_POLISH/REPORT.md`, `docs/reports/PHASE2/ART_INTEGRATION/results-all.json`, `docs/reports/PHASE2/ART_PREP/art-prep-results.json`, `docs/reports/PHASE2/browser-results.json` — historical evidence from earlier sessions, deliberately left unformatted per the instruction not to alter recorded evidence. Every file this session touched is formatted (`npx prettier --write` was run against exactly this session's own file list, not the whole tree). |

Earlier recorded totals for context: Phase 2 closure was **843** tests (`docs/reports/PHASE_2_EVIDENCE.md`
§7.5); the manual-journey-repair pass brought it to **900** (`docs/reports/MANUAL_JOURNEY/REPORT.md`).
This session's own before/after, measured directly by running the backend suite at each step: right
after the gateway fix (write-through cache + `maxAgeMs`, with its own new/rewritten tests already
included), `apps/functions` alone stood at **536** passing tests; after adding the achievements catalog
join and its tests it was **542**; after adding the admin-panel service/routes and their tests it was
**552**. Combined with the unchanged sheet-schema (46) and this session's own web additions, the final
total is **992**.

## 3. Performance — before/after (full detail in `docs/plans/TECHNICAL_CLOSURE.md` §2)

| Action                             | Reads before → after | Total calls before → after |
| ---------------------------------- | -------------------- | -------------------------- |
| `farm/water` (first plant + water) | 9 → 2                | 18 → 11                    |
| `marcelino/first-delivery`         | 16 → 4               | 30 → 18                    |
| `journey/ack` (`walkman_receive`)  | 5 → 1                | 9 → 5                      |
| `arcade/attempt` (win)             | 7 → 2                | 14 → 9                     |

Measured with `apps/functions`'s in-memory fixture (`FakeGoogleSheetsClient`), paced identically to
production (52 requests/minute), by toggling only the four call sites in `sheet-gateway.ts` between the
old and new behavior and replaying the same fixture-driven action — not by editing test expectations
after the fact. Writes were unchanged (this pass did not batch writes across different rows/systems —
see `docs/plans/TECHNICAL_CLOSURE.md` §2 for why that was deferred). This is a cold-cache, single-action,
in-memory measurement: it isolates and proves the call-count reduction directly (deterministic, same
code path regardless of live vs. fixture backing store); it does not reproduce the live pacer-contention
timings from `docs/reports/MANUAL_JOURNEY/NEXT_PERFORMANCE_TASK.md`, which depend on concurrent request
volume this fixture run does not simulate. §5 explains why a live re-timing of the same four actions was
not additionally run this pass.

## 4. Verification evidence, by kind

**Automated (unit/integration):** §2 above — 992 tests, including new coverage for the write-through
cache (`sheet-gateway.test.ts`), the achievements catalog join and secret-achievement hiding
(`player-achievements.service.test.ts`), the achievements route (`player-api.test.ts`), the admin-panel
service (`admin-panel.service.test.ts`), the admin routes' authorization (`app.test.ts`), the achievements
panel's locked/unlocked/secret rendering (`world.test.tsx`), and the tabbed Admin shell (`AdminPage.
test.tsx`).

**Component-level (jsdom/Testing-Library, mocked backend):** the achievements panel and the four Admin
tab views were rendered as real React component trees with a mocked `fetch` shaped exactly like the real
API responses, and driven with real user interaction (click to open a panel, type to search/filter,
submit to look up a player). This is not the same tier as this project's established FIXTURE runs (real
backend + real headless browser over an in-memory Sheet/Drive, e.g. `verify-phase2-browser.mjs`); a true
fixture-browser pass for these two specific features was not built this session — see
`docs/plans/TECHNICAL_CLOSURE.md` §8.

**Live (bounded, quota-conscious, read-only):** `node scripts/verify-phase3-admin-live.mjs` against the
real Sheet/backend, using synthesized sessions for a freshly generated Admin-kind user id and a freshly
generated owner-kind user id (the same technique `scripts/verify-phase2-live-rewards.mjs` already uses —
no real Admin password needed, no real owner session touched):

```
Admin dashboard, log viewer, player inspector, and achievements — live, read-only:
  PASS  GET /api/admin/dashboard returns 200 with the expected shape
  PASS  dashboard.activeSessionCount includes the session this script just created
  PASS  GET /api/admin/logs returns 200 with rows/total
  PASS  GET /api/admin/players/:userId returns 200 with the aggregate shape for a fresh, isolated user
  PASS  an owner session presented as the Admin cookie is rejected, not honoured
  PASS  an invalid Admin cookie is rejected
  PASS  GET /api/player/achievements returns 200 with a locale-resolved catalog join for a fresh owner session
  PASS  a still-locked secret achievement reveals nothing over the wire

All checks passed.
```

This is real proof the new reads parse the **real** Sheet's real column layout (not just the synthetic
in-memory fixture), and that the Admin/owner session boundary genuinely holds live — something the
fixture alone cannot fully establish. It intentionally does not re-run the full 15-step first journey;
that is already evidenced four times over in `docs/reports/MANUAL_JOURNEY/REPORT.md` and this pass did
not change journey/reward logic (only how many times the same data is fetched per action).

**Not re-run:** the full live-Sheet manual journey; the Playwright e2e suite (gate/network-security/
owner-admin-isolation specs submit real Gate/Admin credentials against the live Sheet and are unaffected
by anything in this pass, so re-running them would spend quota to re-confirm behavior nothing here
touched).

## 5. Working preview

`npm run preview:local` → **http://127.0.0.1:5050** (real backend, real Sheet, real read-only Drive
credential; nothing deployed). A stale instance of this same server (from an earlier session, PID 42564) was already listening on port 5050; it was stopped and a fresh one rebuilt from today's code was
started in its place, per the explicit instruction to restart only this project's own preview processes
— no browser window or unrelated process was touched. Confirmed serving: `GET /api/health` → 200 (real
Sheet reachable; `schemaHealth.status` currently `error`, reflecting known content-completeness gaps —
see `docs/plans/TECHNICAL_CLOSURE.md` §8, not something this pass introduced), `GET /` → 200.

### Manual review checklist for Ahmed

1. Open `http://127.0.0.1:5050`, sign in with the real Gate code, play until the world loads.
2. Tap the new trophy button (bottom-right, stacked under the Map button) → the Achievements panel opens,
   shows locked/unlocked/secret states, and closes cleanly (Escape or the close button).
3. Open a second tab to the Admin login (`/admin` route), sign in with the real Admin credentials.
4. The **Dashboard** tab is now the landing view: server time, Sheet health, active sessions, recent
   entry-log rows, and a cache-freshness table.
5. Click **Schema Health** — the existing tab-health table/diagnostics/search/refresh all still work
   exactly as before, just under a tab instead of being the whole page.
6. Click **Entry Logs** — filter by event type / result / IP / user id / date range; Previous/Next
   paginate.
7. Click **Players**, enter `veoulla` (or any known user id), click **Look up** — story progress, keys,
   achievements, arcade scores, messages, and the raw per-location JSON all render.
8. Confirm logging out from any tab returns to the Admin login form.

## 6. Known limitations

1. Reads for the four measured hot actions drop 71–80% in the fixture measurement (§3); this was not
   re-confirmed as a live wall-clock improvement under real pacer contention this pass (quota-conscious
   scope decision, not a gap in the fix itself — the call-count reduction is deterministic).
2. Write-batching across a single action's several `37_CHARACTER_STATE` writes (different rows/systems)
   is not done; those actions still issue one upstream write per system touched.
3. No Sheet deep link or in-app row editing exists in the Admin panel — the spreadsheet id is
   deliberately never sent over the API (a pre-existing rule this pass found and kept).
4. No feature-flag/forced-phase/time-override/active-codes Admin controls exist — nothing in the product
   yet needs them (M15/M16 blocked on Ahmed).
5. A real fixture-browser (headless-browser, real backend) pass specifically for the achievements panel
   and the Admin panel was not built; coverage for those two features is unit/component-level plus one
   bounded live read-only check.
6. The live Sheet's own schema-health status is `error` (875 errors / 101 warnings observed at the time
   of the live check) — pre-existing content-completeness gaps, unrelated to and unchanged by this pass,
   now simply visible on the new dashboard.
7. Every limitation already on record in `docs/reports/MANUAL_JOURNEY/REPORT.md` and `docs/reports/
REVIEW_CORRECTIONS_HANDOFF.md` (missing dialogue/message/quiz/song content, portrait candle-corner
   asset, etc.) is unchanged by this pass.

## 7. Deployment-readiness assessment

Not deployment-ready, and this pass did not attempt to make it so (no commit/push/deploy authorized; M18
deployment configuration/runbooks were explicitly out of scope for this pass per `docs/plans/
THREE_PHASE_DELIVERY.md`). Concretely still needed before a real deployment could be considered:

- M15 (Gemini) and M16 (birthday event) remain genuinely unbuilt and blocked on Ahmed (credentials/
  content/design decisions), not partially built — deploying without them means shipping a product that
  is missing two full milestones' worth of the Master Build Plan's acceptance criteria.
- The live Sheet's content-completeness gaps (schema-health `error` status; missing dialogue, messages,
  quiz content, song eligibility, several art assets — catalogued in `docs/assets/PHASE_2_HANDOFF.md` and
  `docs/reports/MANUAL_JOURNEY/REPORT.md`) are unresolved; the app is playable and honest about what is
  missing, but a real release needs that content supplied.
- Firebase Hosting/Functions deployment configuration, a backup/export runbook, and a documented
  cross-browser/device pass (M18) do not exist yet.
- This pass's own two features (achievements display, Admin panel additions) are covered by automated
  tests and one bounded live check, but not yet by a real-browser FIXTURE run — see §4/§6.

What **is** in place and evidenced, confirmed again this pass: the complete first journey (Gate → Map
unlock) at real content-completeness limits, replay-without-duplicate-rewards, resilience to failed
reads/writes, the full five-language/RTL support, and now a materially cheaper read path for four of the
five slowest first-visit actions and two more completed pieces of the Admin panel.
