# Phase 1 — Item D: Player State, Checkpoints, Keys, Idempotent Rewards (M04)

**Date:** 2026-09-16
**Scope:** Sheet-authoritative read/reconcile of `24_PLAYER_PROGRESS`/`25_PLAYER_KEYS`/`26_PLAYER_ACHIEV`; checkpoint/completion, key award/spend, and achievement-claim APIs; same-key daily caps using the Sheet's authoritative timezone; transaction-ID-based idempotency. All automated tests use isolated fixtures; live verification uses a clearly-fake, isolated test user — never Veoulla's real rows.

---

## 0. Preflight

Read the Master Build Plan's M04 build/acceptance sections, `packages/sheet-schema/src/tabs/player-state.ts` (all seven player-state tabs' exact columns), and the Living Bible §10A (daily same-shape key cap; found/spent/available invariant). Confirmed the schema has **no dedicated reward-transaction ledger tab** among the 42 tabs — the Sheet workbook/tab architecture is still explicitly "Open" per Living Bible §3A — so idempotency had to be designed around the columns that actually exist (§2 below), not a new unreviewed tab/column.

**Critical finding from live-Sheet inspection before writing any code:** the real `24_PLAYER_PROGRESS`/`25_PLAYER_KEYS`/`26_PLAYER_ACHIEV` composite primary keys use `|` as the user/entity separator (e.g. `veoulla|first_journey`, `veoulla|key_shell`), not `:`. An initial draft of this implementation used `:` (matching no particular precedent, just an assumption) — caught by comparing against `packages/test-fixtures/src/good-workbook.ts`'s own fixture rows and then confirmed against the real live Sheet directly, before any test was written against the wrong format. All three composite-key builders were corrected to `|` before proceeding. This is exactly the kind of check CLAUDE.md rule 12 ("preserve stable identifiers") requires and is recorded here as a real caught-before-shipping bug, not asserted after the fact.

## 1. Files changed / created

**New (backend, `apps/functions`):**

- `src/services/authoritative-time.service.ts` — `getAuthoritativeTimeZone()` (reads `01_APP_CONFIG.authoritative_time_zone`, same config key `bootstrap.service.ts` already exposes) and `calendarDateKey()` (an `Intl.DateTimeFormat`-based, no-external-dependency calendar-day computation in that timezone).
- `src/services/player-progress.service.ts` — `getPlayerProgress()`, `checkpointProgress()`, `completeRoute()`.
- `src/services/player-keys.service.ts` — `getPlayerKeys()`, `awardKey()`, `spendKey()`.
- `src/services/player-achievements.service.ts` — `getPlayerAchievements()`, `claimAchievement()`.
- `src/services/player-request-validation.ts` — strict per-endpoint body validation (allowlisted keys only — a client-supplied `userId` in any request body is rejected as malformed, not silently ignored).
- `src/api/player.ts` — the six handlers (§3).

**Modified (backend):**

- `src/api/owner-auth-middleware.ts` — on successful authorization, stashes `res.locals.ownerUserId = resolution.row.user_id` (additive; no existing route's behavior changed) so every player handler resolves "which user" only from the verified session, never from client input.
- `src/app.ts` — registers the six `/api/player/*` routes (all owner-session-protected) and adds a `playerKeyMutex`/`KeyMutex` seam for serializing concurrent key mutations.

**New (scripts, live/manual only, excluded from `npm run test`):**

- `scripts/verify-phase1-d-player-state.mjs` (`npm run verify:phase1:d:player-state`) — live, real-Sheet, isolated-test-user verification (§4).

**Modified:**

- `package.json` — adds the script above.

**New (backend tests):**

- `apps/functions/tests/player-progress.service.test.ts` (11 tests).
- `apps/functions/tests/player-keys.service.test.ts` (13 tests, including a real concurrency test — two `Promise.all`-raced `awardKey` calls for the same key, asserting exactly one applies).
- `apps/functions/tests/player-achievements.service.test.ts` (5 tests).
- `apps/functions/tests/player-api.test.ts` (9 tests): auth boundary on all six routes; a client-supplied `userId` field is rejected; a full checkpoint→award→spend→claim→complete→read-back flow; duplicate-transaction-id retry does not double-award; no raw credential/session-ID leakage.

**Not committed.**

## 2. Idempotency design, per mutation type — what exists, why, and its honest limits

| Mutation                              | Mechanism                                                                                                                                                                                                | Why this is correct/sufficient                                                                                                                                                                                                                                                                                                                    | Documented limitation                                                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checkpoint** (`24_PLAYER_PROGRESS`) | Plain upsert by `user_route_key` (`userId\|routeId`) — the same beat written twice is a harmless no-op write.                                                                                            | Checkpointing is inherently idempotent-by-value: setting `current_beat_id` to the same value twice changes nothing observable.                                                                                                                                                                                                                    | No protection against an out-of-order write from a stale, slow, concurrent request moving `current_beat_id` backward — would need a monotonic ordering column the schema doesn't have. Flagged, not silently solved by inventing a column.                                                   |
| **Route completion**                  | `status === 'completed'` check before writing.                                                                                                                                                           | A route completes exactly once by definition; re-checking this flag is fully correct idempotency, no transaction ID needed.                                                                                                                                                                                                                       | None — this one is airtight given the existing schema.                                                                                                                                                                                                                                       |
| **Key award**                         | `last_award_date` (already an existing column) compared against the authoritative calendar day; `last_source_id` (already existing) compared against the incoming `transactionId` when the date matches. | Matches the Living Bible's own daily-cap rule exactly — award is inherently calendar-scoped, so date-based dedup is the _correct_ model, not a workaround. Distinguishes "retry of the same request" (idempotent no-op) from "a second, different same-day attempt" (correctly rejected as `daily_cap_reached`) using columns that already exist. | None beyond the daily-cap model itself, which is the documented, intended game rule.                                                                                                                                                                                                         |
| **Key spend**                         | `last_source_id` reused as a single "most-recently-applied transaction" marker.                                                                                                                          | Correctly catches the realistic retry pattern (an immediate client resubmission after a network blip, before anything else touches the row) — this app has one active device per player and mutex-serializes concurrent requests, so this is the retry pattern that will actually occur.                                                          | Does **not** catch a transaction ID retried much later, after a different transaction has since touched the same row — a full audit-ledger tab would close this, and none exists in the current 42-tab schema. Explicitly flagged in code comments and here, not silently declared complete. |
| **Achievement claim**                 | `claimed === true` boolean check.                                                                                                                                                                        | A one-time reward's "already claimed" flag is, on its own, the complete and correct idempotency check — no transaction ID needed at all, the simplest and most robust case of the four.                                                                                                                                                           | None.                                                                                                                                                                                                                                                                                        |

**Concurrency**: `KeyMutex` (already used internally by `SheetGateway` for single write calls) is reused at the _service_ level to wrap each key mutation's entire read-decide-write sequence — necessary because a race between two concurrent `awardKey` calls for the same `(userId, keyTypeId)` spans two separate gateway calls (`findByPrimaryKey` then `appendRow`/`updateByPrimaryKey`), which the gateway's own internal per-call locking cannot protect on its own. Proven directly: `player-keys.service.test.ts`'s concurrency test races two real concurrent `awardKey` calls and asserts exactly one applies, never both, never neither.

## 3. API surface

| Method | Route                            | Purpose                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/player/state`              | Consolidated progress/keys/achievements for the resolved owner user |
| POST   | `/api/player/checkpoint`         | `{routeId, beatId, checkpoint, currentLocation?}`                   |
| POST   | `/api/player/route/complete`     | `{routeId}`                                                         |
| POST   | `/api/player/keys/award`         | `{keyTypeId, quantity?, transactionId}`                             |
| POST   | `/api/player/keys/spend`         | `{keyTypeId, quantity, transactionId}`                              |
| POST   | `/api/player/achievements/claim` | `{achievementId}`                                                   |

All six are owner-session-protected via the existing `createOwnerAuthMiddleware` (Admin-in-owner-cookie still rejected 403, proven again for this route group in `player-api.test.ts`). None of the request bodies accept a `userId` field at all — `hasOnlyKeys` allowlisting rejects it as malformed, so a client can never target another player's state even by mistake, let alone maliciously.

Business-rule outcomes (`daily_cap_reached`, `duplicate_transaction`, `insufficient_keys`, `already_claimed`, `already_completed`) are returned as `200 OK` with `applied: false` and a `reason` — not HTTP errors — since these are well-defined, expected outcomes the frontend must branch on, not request/system failures. Malformed requests and missing authentication remain proper `400`/`401`/`403`.

`24_PLAYER_PROGRESS.first_journey_completed`/`map_unlocked` are **never read or written anywhere in this item** — proven directly in `player-progress.service.test.ts`. That specific transition belongs to the real Map-unlock milestone (M14/Phase 2) per the Living Bible §18J.

## 4. Live verification (real Sheet, isolated test user — never Veoulla's real rows)

```text
npm run verify:phase1:d:player-state

Isolated test user: phase1_d_verification_user (never "veoulla")

=== Checkpoint (real Sheet) ===
  PASS  200 + applied
  PASS  current beat recorded correctly

=== Key award + daily-cap idempotency (real Sheet) ===
  PASS  first award applies
  PASS  second, different-transaction award the same day is rejected (daily cap)
  PASS  quantity changed exactly once

=== Key spend (real Sheet) ===
  PASS  spend applies and available reaches zero

=== Achievement claim idempotency (real Sheet) ===
  PASS  first claim applies
  PASS  second claim is a no-op (already_claimed)

=== Route completion (real Sheet) ===
  PASS  route completes

=== Consolidated state read survives a fresh request (real Sheet) ===
  PASS  progress/keys/achievements all reflect the writes above

Summary: 10 passed, 0 failed
```

After this run, a direct read of `veoulla|first_journey` confirmed it is byte-for-byte unchanged (`status: "not_started"`, `first_journey_completed: "0"`, `map_unlocked: "FALSE"`) — the live test writes only ever touch rows keyed under `phase1_d_verification_user|...`, which remain in the Sheet afterward (no delete operation exists in the gateway), exactly like other test rows this project's live scripts have already left in `05_ENTRY_LOGS`/`06_SESSIONS` (M02/M03).

## 5. Commands run and results

```text
npm run format         → PASS
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 581/581 across 53 files (46 sheet-schema + 355 functions + 180 web)
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run verify:phase1:d:player-state → PASSED, 10/10 (real Sheet, isolated test user — see §4)
```

No `firebase deploy` was run.

## 6. Known limitations

- **Spend-transaction idempotency is a simplified "last applied transaction" model**, not a full audit ledger (§2) — a real limitation of the current schema, not an oversight; a future dedicated ledger tab (if Ahmed/ChatGPT's Sheet design adds one) could close this fully.
- **No out-of-order/regression protection for checkpoint writes** — deferred pending a monotonic ordering column decision (§2).
- **No cross-validation of `keyTypeId`/`achievementId`/`routeId` against `21_KEYS`/`23_ACHIEVEMENTS`/`13_ROUTES`** — this item accepts any syntactically valid ID and trusts the caller (future E/F beats using real Sheet-authored IDs) to supply a real one; this mirrors the same trust boundary `media-asset.service.ts` already uses for `location_id`.
- **No live Playwright spec** was added for `/api/player/*` — covered instead by the real-Sheet live script (§4) and the full backend integration-test suite; a credential-gated Playwright spec exercising this through the real UI is a reasonable follow-up once E/F build screens that actually call these endpoints.

## 7. Confirmations

- Only Phase 1 item D (M04) was implemented. No M05+ (E/F/G) work was started.
- `first_journey_completed`/`map_unlocked` were never read or written.
- No automated test touched Veoulla's real fixture rows (`veoulla|...`) for mutation — proven by an explicit "isolation" test in each of the three service test files, asserting the real-shaped fixture row for a different user is byte-for-byte unchanged after every operation.
- The one live verification script used a clearly-isolated, obviously-fake test user, never "veoulla", and this was confirmed by re-reading Veoulla's real progress row afterward and finding it unchanged.
- Nothing was committed, merged, pushed, or deployed.

## 8. Completion addendum — resumed handoff audit

The handoff audit found two remaining M04 acceptance gaps and one idempotency edge case:

- `playerClient.ts` now keeps a per-authenticated-user local read cache and a per-user pending mutation queue for checkpoints and key awards. It never places `userId` in an API body. Pending mutations reconcile before the next authoritative read, and only network/429/5xx failures queue; invalid 4xx requests do not.
- The exact same award transaction retried after the authoritative calendar day changed could previously award again because the daily-cap comparison ran before the transaction comparison. The transaction ID is now checked first, with a dedicated later-day retry test.
- The real-browser run encountered an actual Google Sheets 429 during one pass; the key award was retained with its stable transaction ID and the story continued. A later pass also proved the normal applied path. This is direct evidence for the pending-retry behavior rather than a simulated-only claim.

The current schema still cannot remember an unlimited history of transactions after another transaction overwrites `last_source_id`; that original limitation remains explicit and is not hidden by the queue.
