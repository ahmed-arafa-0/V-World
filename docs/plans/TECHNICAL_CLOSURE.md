# Phase 3 technical closure checklist

Status: living checklist for Ahmed's 2026-09-22 "continue toward technical completion" authorization.
Scope/attribution: `docs/plans/THREE_PHASE_DELIVERY.md` (Phase 3 = M15–M18). Nothing here overrides
CLAUDE.md, the Living Bible, or the Master Build Plan; where this document says a Phase-3 item is
blocked, that is a report of an existing gap (CLAUDE.md rule 13), not a new decision.

No commit, push, merge, or deploy is authorized by this document. The real owner's (`veoulla`) rows
are never written by this work; all live checks use isolated generated users.

## 0. What "Phase 3" actually covers, and what is genuinely startable now

Master Build Plan §M15–M18:

- **M15 — VAR Hybrid AI (Gemini).** Requires a live Gemini API authorization key from Ahmed's second
  Google account, an approved Sheet-configured prompt/personality/knowledge-flag row set, and the
  account/project reference. **None of this exists in this working tree or has been supplied.**
  CLAUDE.md rule 8 ("Gemini is deferred to M15") and the Living Bible §3B mark VAR's memory-category
  design as **Open**. Building the request/response plumbing without real content would mean inventing
  VAR's personality/prompt rules and knowledge base — explicitly forbidden. **Blocked on Ahmed**, not a
  code gap.
- **M16 — Birthday Event Engine.** The Living Bible §18I phase table (B0–B10) is marked **"Proposed"**,
  not Locked; §18I's own "Open content inputs" section lists the target date, exact phase boundaries,
  reward content, and birthday message/story text as still open. Building the phase-calculation engine
  around invented dates/content/rewards would violate CLAUDE.md rules 10 and 13. **Blocked on Ahmed's
  approval of the phase design and the actual birthday content**, not a code gap.
- **M17 — Admin Panel.** Only login + Schema Health exist today (Phase 1). Everything else the
  milestone's acceptance criteria ask for (dashboard, controls, log viewer, player inspection, cache
  refresh — already present for schema health) is genuinely unbuilt, but it is **not content-blocked**:
  the underlying Sheet tabs (`04_ADMIN_FLAGS`, `05_ENTRY_LOGS`, `06_SESSIONS`) already exist with usable
  schemas, and every read this needs is of the operator's own operational data, not invented product
  content. **This is the real startable Phase-3 implementation work.**
- **M18 — Integration, performance, deployment.** Deployment configuration/runbooks and a full
  cross-browser/device pass are real Phase-3 scope; the **performance** portion is explicitly the
  subject of `docs/reports/MANUAL_JOURNEY/NEXT_PERFORMANCE_TASK.md` (see §2 below) and is startable now
  without new content. Firebase Hosting deployment itself is out of scope for this pass (no commit/push
  /deploy authorized).

**Conclusion:** this pass's realistic Phase-3 implementation scope is M17 (Admin panel, minus anything
that would require inventing birthday/AI controls that don't exist yet) + the M18 performance work +
the achievements display carried over from Phase 2's "known follow-ups" list
(`docs/plans/PHASE_2_PROGRESS.md`). M15/M16 stay flagged below as blocked, not silently skipped.

## 1. Remaining approved implementation

| #    | Item                                                                                                                                                                            | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Performance: reduce redundant `37_CHARACTER_STATE`/`04_ADMIN_FLAGS`/`24_PLAYER_PROGRESS` reads per action (write-through cache; honor the `maxAgeMs` a caller already asks for) | **Done this pass** — see §2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.2  | Achievements display (player-facing)                                                                                                                                            | **Done this pass** — see §3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.3  | Admin dashboard (authoritative time, Sheet health, session count, last logs, pending sync)                                                                                      | **Done this pass** — see §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.4  | Admin entry-log viewer with IP/date/result filtering                                                                                                                            | **Done this pass** — see §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.5  | Admin player inspector (story/keys/achievements/farm/scores/messages)                                                                                                           | **Done this pass** — see §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.6  | Admin cache-refresh control (beyond schema health's own)                                                                                                                        | Already covered — schema health's refresh already bypasses the gateway cache for the whole tab set; no separate control needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.7  | Admin feature flags / forced-phase / time-override / active-codes controls                                                                                                      | **Not built.** M17 describes these as controls over birthday/event/AI state that does not exist yet (M15/M16 blocked, §0). Building toggle UI for systems that don't exist would be scope invention. Deferred until M15/M16 unblock.                                                                                                                                                                                                                                                                                                                                                              |
| 1.8  | Admin safe row editing / deep link to Sheet tab                                                                                                                                 | **Not built.** `apps/functions/src/config/resource-config.ts`'s own existing comment states the spreadsheet id "must never be... exposed over the API" — a pre-existing, deliberate decision this pass found and chose to respect rather than override. A per-tab deep link would put that id (directly, or via a redirect's `Location` header) into an API-reachable response, so it was dropped rather than half-built against a rule already on record. In-app row editing was judged out of scope for this pass given the real-owner-safety bar. Ahmed already has his own link to the Sheet. |
| 1.9  | M15 Gemini integration                                                                                                                                                          | **Blocked on Ahmed** (§0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1.10 | M16 Birthday event engine                                                                                                                                                       | **Blocked on Ahmed** (§0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1.11 | M18 Firebase Hosting/functions deployment config, backup/export runbook                                                                                                         | **Not attempted** — deploy actions are out of scope for an authorized-but-uncommitted pass; flagged as remaining work for when Ahmed requests an actual deployment                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 2. Performance — measured before/after

Source finding: `docs/reports/MANUAL_JOURNEY/NEXT_PERFORMANCE_TASK.md`. Root causes confirmed by reading
`apps/functions/src/repositories/sheet-gateway.ts` and `apps/functions/src/world/journey.ts`:

1. **`ReadOptions.maxAgeMs` was documented but never read.** `getRawTab`'s bypass fast path always used
   the hard-coded 2.5 s `FRESH_REUSE_MS`, so callers that explicitly asked for a longer reuse window
   (`journey.ts`'s `04_ADMIN_FLAGS` read: 15 s; `session-resolution.service.ts`'s session recheck: 4 s)
   silently got only 2.5 s — exactly the "loader allows a 15s copy but it's still fetched 2-3 times"
   symptom recorded in the task. Fixed: `getRawTab` now honors `options.maxAgeMs ?? FRESH_REUSE_MS`.
2. **Every write invalidated its whole tab**, so any later read in the SAME action (even of a
   different row) forced a fresh upstream fetch of the entire tab, repeatedly, inside one player
   action. Fixed: `updateByPrimaryKey`/`appendRow`/`appendRowsIfAbsent` now patch the cached copy of the
   tab in place (`writeThroughRow` / `writeThroughAppend`) instead of dropping it, so a same-process
   follow-up read sees the just-written value without a second round trip. The optimistic pre-write
   check (`findFresh`, used by `mutateWorldDoc` before every commit) still always does a genuine
   `strict` upstream read regardless of this cache — the change is a read-side latency optimization,
   not a change to how conflicts are detected before a write is committed. A known, bounded,
   self-healing tradeoff (two DIFFERENT rows of the same tab written by two concurrent requests can
   race on which snapshot each started from, so a third party's cached read of the tab could briefly
   miss the loser's patch) is documented in the code comment; it never affects the Sheet itself, and
   heals via the tab's normal TTL or the next strict read.

**Measured** (`apps/functions`, in-memory fixture, `SheetGateway` configured with the same production
pacing as `gateway-context.ts`: 52 requests/minute; one isolated fixture user per action, cold cache;
call counts from the fake Sheets client, not wall-clock, since the fixture has no real network latency
to compare — see the note below):

| Action                             | Reads before → after | Writes (unchanged) | Total calls before → after |
| ---------------------------------- | -------------------- | ------------------ | -------------------------- |
| `farm/water` (first plant + water) | 9 → 2                | 9                  | 18 → 11                    |
| `marcelino/first-delivery`         | 16 → 4               | 14                 | 30 → 18                    |
| `journey/ack` (`walkman_receive`)  | 5 → 1                | 4                  | 9 → 5                      |
| `arcade/attempt` (win)             | 7 → 2                | 7                  | 14 → 9                     |

Reads dropped 71–80% for all four actions; writes are unchanged (this pass did not batch writes across
different rows — see below). Measured by temporarily reverting only the four call sites in
`sheet-gateway.ts` (not the rest of the uncommitted tree), running the same fixture-driven action once,
then restoring the fix and re-running; `apps/functions`'s full suite (536 tests) passes at both states
and at the final state.

**Why this predicts a real reduction in the live pacer waits recorded in `NEXT_PERFORMANCE_TASK.md`**
(40–78% of wall time was the pacer, not Google latency): the pacer only engages once the 52-per-minute
budget is under pressure; call volume is the direct input to how often and how long it waits. Cutting
reads by ~75% for the four hottest actions removes the majority of that pressure. This was not
re-verified against the live Sheet in this pass (§5 explains why: quota-conscious live verification is
reserved for one bounded run, not repeated full journeys) — the call-count reduction is measured
directly and is deterministic (same code path, same number of gateway calls issued, independent of
whether the backing store is the in-memory fixture or the real Sheet); the live wall-clock improvement
still needs the one bounded live check in §5.

**Not done from `NEXT_PERFORMANCE_TASK.md`'s candidate list**, with reasoning:

- _Fold the several `37_CHARACTER_STATE` writes of one action into a single batched write_ (e.g.
  `acknowledgeInteraction`'s `cafe` + `journey` doc writes). Writes stayed unchanged in the measurement
  above. This needs a new gateway primitive that batches writes to _different rows_ of the same tab
  across _different_ per-(user,system) mutex keys, which changes the locking granularity `mutateWorldDoc`
  relies on for concurrency safety. Given the explicit acceptance bar to preserve concurrency safety and
  idempotency, and that the read-side fix already delivers the dominant improvement (`NEXT_PERFORMANCE
_TASK.md` itself ranks write-through caching and call reduction above write batching "in order of
  expected effect"), this was left as a documented follow-up rather than attempted under time pressure.
- _Issue independent per-player reads together via `Promise.all`_ — audited; the genuinely independent
  reads inside `loadFacts` are already issued via `Promise.all` and already coalesce into one batched
  upstream request (`SheetGateway`'s existing `coalescedRead`). The remaining sequential reads are
  genuinely dependent (read-modify-write per document; a later step depends on an earlier write having
  committed), not parallelizable without changing what they mean.
- _Re-measure against a human-paced run_ — not done; requires a live run (quota-conscious; see §5).

## 3. Achievements display (player-facing) — done this pass

Backend already had a solid service (`player-achievements.service.ts`: `getPlayerAchievements`,
`claimAchievement`, idempotent) but exposed only raw per-player progress rows (no title/icon/description
— that catalog metadata lives in `23_ACHIEVEMENTS`, never joined). No frontend component existed at all
(confirmed absent by a targeted search — not a naming mismatch).

Built: a catalog join on the backend (title/description/icon/points from `23_ACHIEVEMENTS`, resolved
per-locale, secret achievements hidden until unlocked), a typed contract, and a player-facing view.
Full detail and evidence in the implementation section below (this checklist is updated as work lands;
see `docs/reports/PHASE3_TECHNICAL_CLOSURE_EVIDENCE.md` for the finished write-up).

## 4. Admin panel — done this pass

Dashboard (authoritative time/timezone, Sheet health summary, active session count, last N entry-log
rows, and a cache-freshness table as the honest reading of "pending sync" for a Sheet-backed store with
no separate write queue — see §2), entry-log viewer (filter by date range / event type / result / IP /
user id, paginated, read-only), and player inspector (look up any user id and see their journey
progress, keys, achievements, farm state, arcade scores, and message/mailbox state — read-only; no Sheet
deep link, see row 1.8). All admin routes reuse the existing `requireAdmin` session middleware and its
existing rejection of an owner session presented on the Admin cookie. Admin login/logout is already
logged (`admin_success`/`admin_failure`/`admin_rate_limited`/`session_*` events, unchanged by this pass);
these three new routes are plain reads with no side effect to log — M17's "Admin actions themselves are
logged" acceptance point is about mutating controls, none of which exist yet (row 1.7 is blocked on
M15/M16), so there is nothing here that needs its own audit trail beyond the session log already in
place. No control that could duplicate a one-time reward or touch a real player's progress was added —
every new route is a plain read.

## 5. Verification — what was actually run

- **Automated (done):** full workspace `format:check`, `lint`, `typecheck`, `test` (46 sheet-schema +
  552 functions + 394 web = 992 tests), `build`, and `security:scan` — see
  `docs/reports/PHASE3_TECHNICAL_CLOSURE_EVIDENCE.md` for exact output.
- **Component-level (done, not the same as a real-browser FIXTURE run):** the new achievements panel and
  the four new Admin views (dashboard, schema health under its new tab, log viewer, player inspector)
  are exercised by jsdom/Testing-Library tests against a mocked `fetch` matching the real response
  shapes — real component trees, real user interaction (click/type), real conditional rendering
  (locked/secret/unlocked achievement states; owner-vs-admin cookie rejection), but not a real backend or
  a real browser. This is lighter than this project's established "FIXTURE" tier (real backend + real
  headless browser over an in-memory Sheet/Drive, as `verify-phase2-browser.mjs` runs); a true
  fixture-browser pass for these two features specifically was not built this session and is listed as
  outstanding in §8.
- **Live (done, bounded, quota-conscious, read-only):** `scripts/verify-phase3-admin-live.mjs` — 8/8
  checks against the real Sheet: the three new Admin routes and the achievements route all return the
  expected shape for a freshly generated, isolated session (not `veoulla`); an owner session on the
  Admin cookie is rejected; an invalid Admin cookie is rejected; a still-locked secret achievement
  reveals nothing over the wire. No full live-Sheet journey was re-run — the last four (Firefox ×2,
  Chromium desktop, Chromium mobile) are already evidenced in `docs/reports/MANUAL_JOURNEY/REPORT.md`
  and this pass's gateway change does not alter journey/reward logic, only how many times the same data
  is fetched, which the fixture measurement in §2 already establishes deterministically.

## 6. Missing supplied content/media (unchanged carry-over, not re-litigated here)

**Update 2026-09-23:** the "dialogue rows for most beats" and story-image portions of this carry-over
are now closed — see `docs/reports/DIALOGUE_IMAGES_AUDIO_PREVIEW_EVIDENCE.md` (all 80 first-journey
dialogue rows activated; all 50 story images discovered, registered, and linked). The rest of this
list is unchanged and unclaimed by that pass.

Unchanged from `docs/reports/MANUAL_JOURNEY/REPORT.md` §"Missing live content" and
`docs/reports/REVIEW_CORRECTIONS_HANDOFF.md` §"Awaiting media / content" —
`msg_welcome_ahmed`/`msg_bday_*` text, the Church quiz/verse content, arcade game-name text, Walkman
song eligibility, beach ambience audio, a portrait candle-corner asset, Museum/exhibit text. None of
these block Phase 3's technical work; each renders an honest empty/pending state instead.

## 7. Optional polish and genuinely unresolved product decisions

- Birthday event design (Living Bible §18I "Open content inputs"): target date, exact phase content,
  reward set — Ahmed's decision, not a code gap.
- VAR/Gemini personality, prompt rules, and memory-category design (Living Bible §3B **Open**) — Ahmed's
  decision plus the actual Gemini API credential.
- Admin feature-flag/forced-phase/time-override controls (§1 row 1.7) — meaningful only once M15/M16
  exist to control.
- In-app Sheet row editing from the Admin panel (§1 row 1.8) — no deep link either, given the
  never-expose-the-id rule this pass found; full in-app editing is optional future polish if Ahmed wants
  a browser-only workflow, but he can already open the Sheet directly today.
- Write-batching across systems and human-paced live re-measurement (§2) — documented follow-ups, not
  attempted this pass.

## 8. Outstanding after this pass

- A real headless-browser FIXTURE run (in-memory Sheet/Drive, real backend, real browser — the same tier
  as `verify-phase2-browser.mjs`) specifically covering the achievements panel and the Admin dashboard/
  logs/player-inspector tabs was not built. The component-level tests in §5 cover the same logic paths
  but not real network/render timing or cross-browser rendering.
- The dashboard's Sheet-health summary currently reads `error` status on the live Sheet (875 errors, 101
  warnings at the time of this pass's live check) — this reflects known content-completeness gaps already
  catalogued in `docs/assets/PHASE_2_HANDOFF.md` and §6 above, not a defect introduced by this pass (no
  Sheet content or schema was touched); it is visible now only because the dashboard is new and surfaces
  it.
- M17's feature-flag/forced-phase/time-override/active-codes controls, and Sheet row editing, remain
  unbuilt pending M15/M16 and a product decision on in-app editing (§7).
