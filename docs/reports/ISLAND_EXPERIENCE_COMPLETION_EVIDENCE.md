# Island Experience Completion — Evidence Report

Date: 2026-09-23
Scope: Museum, keys, remaining Arcade games, scripted companion, Firebase target verification. No birthday-event work. No deploy, commit, or push.

## 1. Summary of what was implemented and verified

### 1.1 Museum ("The Everkeep")
- **Mechanism was already complete** (server-verified entrance, wing navigation, exhibit unlock rules, empty/error/retry states, Back/Leave, mobile hotspot layout) — confirmed by prior evidence reports and re-verified live in this pass.
- **Content gap closed**: activated 50 previously-drafted-but-disabled `08_UI_TEXT` rows (Museum's own display name/subtitle, the three exhibit titles, and — discovered during live verification — the three original Arcade games' cabinet names, see §1.3) and added the three Museum wing display names (`museum_archive_wing` "The Archive", `museum_stories_wing` "Stories", `museum_memories_wing` "Memories"), all in 5 languages. Verified live: the Wings panel now shows real names instead of "Wing 1/2/3".
- **`key_everkeep` (the Museum key)**: investigated and found it is **already fully and correctly wired** in the live Sheet — `22_KEY_RULES.rule_museum_unlock` is linked from `14_STORY_BEATS.beat_15_museum_approach.reward_rule_id`, so the existing generic beat-reward mechanism (`journey.ts`'s `syncJourney`) awards it automatically on entrance verification. No code or content change was needed here; confirmed by both the existing unit test (`world-locations.test.ts`) and a live Sheet read.
- **Genuinely missing, not fabricated** (per instruction): the real comic PDF + cover (`comic_pdf_2025`/`comic_cover`), the previous-birthday-site archive source (`previous_birthday_site`), and the birthday/memories exhibit's real photos/text/audio (`exhibit_birthday_2026`, still literal placeholder tokens in the Sheet). These require Ahmed's own files and are listed, not invented.

### 1.2 Keys — see the authoritative table in §2.

### 1.3 Arcade: Maze and Trivia
- **Maze** (`var_maze`, cabinet 4, "The Way Out"): new `MazeGame` component (`apps/web/src/features/world/games/games.tsx`) — recursive-backtracker generation (5×5 to 9×9 by difficulty), BFS-guaranteed solvable, tap-to-move and arrow-key movement, scored like the other games. Registered in the existing `GAME_COMPONENTS` registry; needed zero backend changes (the existing `arcade.ts`/`recordAttempt` pipeline is already family-agnostic).
- **Trivia** (`trivia`, cabinet 5, "One More Question"): new Sheet tab `42_ARCADE_TRIVIA` (distinct from the Church's `31_CHURCH_QUIZ` — never reused), a new backend module `apps/functions/src/world/arcade-trivia.ts` (`getTriviaQuestions`/`submitTriviaAnswer`, server-side answer validation — the one genuine new mechanism Trivia needs, since unlike the other four games its correctness can't be trusted client-side), two new routes, new contract types, and a new `TriviaGame` component that fetches/answers questions and finishes through the existing, unmodified `/arcade/attempt` path.
- **Content**: seeded a 5-question starter trivia bank (5 languages, `enabled: TRUE`, `review_status: pending_review` — Ahmed's chosen path: live now, flagged for his later review/replacement), non-personal and world-lore based (island key shapes, the Museum's name, VARcade's cabinet count).
- **Both cabinets enabled** in `32_ARCADE_GAMES` (`game_maze`, `game_trivia`).
- **Bonus fix discovered during live verification**: the original three games' own cabinet names (`game_memory_name`, `game_catch_name`, `game_puzzle_name`) were also still drafted-but-disabled in the live Sheet, showing a generic "Game" label. Activated alongside the others — all 5 cabinets now show real names live: Matching Cards · Catch the Surprises · Picture Puzzle · The Way Out · One More Question.
- **Real bug found and fixed during live verification**: `ArcadeView.tsx`'s `finish()` optimistically shows a result, then updates it again after the server confirms — that confirmation was unconditional, so a slow `/arcade/attempt` response for a just-finished game could land *after* the player had already switched to and started a different cabinet, silently stamping the old game's score onto the new one (reproduced live: Trivia's result panel showed Maze's leftover "Score: 246"). Fixed with a `playingRef` guard so a stale response can never overwrite a different game's outcome. Verified fixed live (screenshot evidence below).

### 1.4 Scripted companion
- New Sheet tab `43_COMPANION_HINTS` (location + journey-state-keyed, 5 languages), a new resolver `apps/functions/src/world/companion-hints.service.ts` (`resolveCompanionHint` — reads the *real*, current `getJourneyState`, so a hint can never reference a beat that isn't actually the next eligible action, and the Church exclusion is enforced server-side, not just by client cooperation), a new route (`POST /companion/hint`), and a new frontend `CompanionHint` tappable-bubble component wired into Arcade, Café, Cottage, Farm, and Museum (not Church, not Junction/Exterior — those have no real `11_LOCATIONS` id to key hints to).
- Seeded 12 starter hint lines (60 rows across 5 languages) — neutral, operational guidance ("try planting a seed here"), not deep personal VAR narrative, tied to real story-beat ids read live from the Sheet.
- **No Gemini/AI wiring exists anywhere in the repo** (confirmed by prior research and unchanged by this pass) — the companion stays purely scripted, no API key, no external dependency.

### 1.5 Firebase
- `.firebaserc`: `demo-veoullas-world` (placeholder, not a real accessible project) → **`veoulla-world`** (the one real project visible via `firebase projects:list` on the linked account).
- `firebase.json`: restored the working copy's `hosting.public` to `apps/web/dist` (matches the Vite build output; the uncommitted copy had regressed to `public`) and restored the `/api/**` → Cloud Function rewrite that had gone missing from the working copy.
- **No deploy was performed.** Deployment prerequisites appear otherwise in place (single `api` HTTPS function export, `nodejs20` runtime matches `engines`, service account file present and correctly gitignored) — see §4 for the one caveat.

## 2. The seven-key table (authoritative, from the live Sheet + code)

| Key ID | Shape / display name | Location | Exact earning action | Eligibility | Daily / first-visit limit | Repeat behavior | Used where |
|---|---|---|---|---|---|---|---|
| `key_shell` | Shell | Beach | `claimBeachSignature()` — the first-journey Beach "signature" interaction | Must have reached `naming_complete` in the first-opening route | One-time (first-journey beat reward); no further daily award path configured | Replay never re-awards it (idempotent `claimRuleReward`) | Museum entrance requirement (1 of 6) |
| `key_candle` | Candle | Church | `lightCandle()` (first candle) **or** `answerQuiz()` completing that day's quiz | First candle: first-journey beat. Quiz: daily, Sheet/date-scheduled question rows | Quiz: max 1 `key_candle`/day (server daily cap in `player-keys.service.ts`) | Daily quiz completion can re-award once/day; replay of the first-candle beat never duplicates | Museum entrance requirement (1 of 6) |
| `key_music` | Music note | Café | `openGramophone()` — first-journey Café interaction | First-journey beat only | One-time; no recurring Café key rule configured yet (Living Bible marks the exact schedule "Open") | Idempotent, no duplication on replay | Museum entrance requirement (1 of 6) |
| `key_token` | Retro arcade token/coin | Arcade | `recordAttempt()` win on the intro machine (first cabinet) via `recoverArcadeIntroReward`; also spendable to unlock further cabinets | First-journey beat for the intro reward; `min_score` gate from `22_KEY_RULES` | Once per eligible period (`period_type` on the rule); daily cap enforced by `awardKey` | Idempotent; a Sheet-added `arcade_score`/`arcade:<game_id>` rule (not currently configured for any cabinet, Maze/Trivia included — matches the existing live pattern for Catch/Puzzle) would add further once-per-period rewards if Ahmed configures one | Museum entrance requirement (1 of 6); spent to unlock Catch/Puzzle/Maze/Trivia cabinets |
| `key_letter` | Envelope | Cottage | `deliverFirstMessage()` / `openMessage()` — first-journey mailbox interactions | First-journey beat | One-time; no recurring mailbox key rule configured yet ("Open" in the Living Bible) | Idempotent | Museum entrance requirement (1 of 6) |
| `key_sunflower` | Sunflower | Farm | `plantSeed()` + `waterPlot()` — first-journey Farm interaction | First-journey beat | One-time; no recurring Farm key rule beyond the intro | Idempotent | Museum entrance requirement (1 of 6) |
| `key_everkeep` | Ancient/golden key (legendary, cap 1) | Museum | Automatic on `verifyEntrance()` succeeding — awarded via the beat-15 reward rule (`rule_museum_unlock`) through the generic `syncJourney` → `claimRuleReward` path | Requires the puzzle-solve step (`solveFinalRoadPuzzle`) plus the other 6 keys already owned | Once (`period_type: once`) | Idempotent; confirmed by `world-locations.test.ts`'s existing "pays the Everkeep key" test and a live Sheet read | Not currently required by any wing (wings unlock via `story_progress`/`achievement`/date/other-key rules); available for Ahmed to wire into a future wing/achievement if desired |

Museum entrance itself requires **1 each of the first six keys** (`museumRequirement()`'s live-configured default), independent of whether `key_everkeep` has been collected — so entrance is always reachable from an ordinary playthrough, and `key_everkeep` being legendary/collectible doesn't gate anything else today.

## 3. Regression and verification

### Commands run (all green)
- `npm run format:check` (repo-wide; pre-existing unrelated drift in ~150 untouched files was left alone — only files this session created/edited were formatted and re-verified clean)
- `npm run lint` — 0 problems
- `npm run typecheck` — 0 errors
- `npm run test` — **sheet-schema 46/46, functions 614/614, web 418/418** (1,078 tests total), including new suites: `arcade-trivia.test.ts`, `arcade-maze-trivia-enabled.test.ts`, `companion-hints.test.ts`, `island-completion-museum-arcade-text-seed.service.test.ts`, `island-completion-arcade-trivia-companion-hints-seed.service.test.ts`, `arcadeGames.test.ts` (maze generator/scoring)
- `npm run build` — all 5 workspaces build clean
- `npx playwright test` — pre-existing Gate/Admin/routing e2e suite (this repo has no Museum/Arcade Playwright specs yet — that coverage has always come from the `scripts/verify-*-browser.mjs` pattern instead): **38 passed, 10 failed, 14 skipped.** All 10 failures are Admin-route (`/admin`) direct-navigation/reload tests, root-caused to a pre-existing environmental condition, **not a regression from this pass**: port 5050 was already occupied by a `scripts/serve-local-preview.mjs` process that had been running since 07:44 that morning (well before this session started) — Playwright's `reuseExistingServer` setting (on by default outside CI) reused that server instead of starting its own Firebase Hosting+Functions emulator via `npm run emulators:build`. `serve-local-preview.mjs` is plain `express.static` with no SPA-fallback rewrite for direct navigation to a client-side route, so `/admin` 404s under it regardless of any change in this pass — confirmed by inspecting the listening process directly (PID, start time, command line) rather than assumed. That pre-existing process was left untouched (per "preserve Ahmed's current review state"); if a clean e2e run is wanted, close it first or run with `CI=1` to force a fresh emulator.

### Live verification (real Sheet, real backend, nothing deployed, isolated test players)
`scripts/verify-island-completion-live.mjs` — **15/15 checks passed** on the final run, using two brand-new isolated player ids (never `manual_review_player`, never Ahmed's own save):
- Museum reachable; free-roam revisit correctly lands in the Central Hall directly (no re-gating); Wings panel shows real names
- All 5 Arcade cabinets show real names
- Maze: renders, solved by **tapping cells** (BFS-computed path — exercises the same touch path a phone uses), reaches a win result with Play Again
- Trivia: renders, fetches real questions, shows correct/incorrect feedback with explanation, reaches a final result
- Companion hint: shows a real authored line at the Farm; **absent inside the Church**
- Fresh player: starts at naming after the Gate; reload preserves session/journey position
- Zero console/page errors throughout

Screenshots and the full machine-readable results: `docs/reports/ISLAND_COMPLETION_LIVE/`.

### Sheet content actions taken (all idempotent, re-run-safe)
1. `scripts/create-island-completion-tabs.mjs` — created `42_ARCADE_TRIVIA` and `43_COMPANION_HINTS` tabs with header rows (the only tabs ever created programmatically in this repo; every other tab was created by hand — scoped to *only* adding these two new, empty, additively-named tabs, no existing tab/row/column touched).
2. `scripts/seed-island-completion-museum-arcade-text.mjs` — activated 50 drafted `08_UI_TEXT` rows, added 15 wing-name rows.
3. `scripts/seed-island-completion-arcade-trivia-companion-hints.mjs` — seeded 25 Trivia question rows, 60 companion-hint rows, enabled `game_maze`/`game_trivia`.

## 4. Outstanding items (genuinely missing or needing Ahmed's decision — nothing invented)

1. **Museum comic PDF + cover** (`comic_pdf_2025`, `comic_cover`) — no file exists anywhere in the repo; needs Ahmed's real PDF and cover image, or confirmation of an alternative.
2. **Previous-birthday-site archive** (`previous_birthday_site`) — source not registered; also needs a decision on whether it's a link or an uploaded file (the Living Bible leaves the "archived-site technical preservation method" open).
3. **Birthday/memories exhibit** (`exhibit_birthday_2026`) — `image_asset_ids`/`audio_asset_id` are still literal placeholder tokens; needs Ahmed's real photos/text/audio (correctly date-locked until the birthday event, per existing design).
4. **Trivia question bank is a draft** (`review_status: pending_review`) — Ahmed asked for it to go live now with a starter set; he should review/replace the 5 seeded questions at his convenience via the Sheet.
5. **Companion hint lines are drafts** — 12 starter lines seeded and live; same review-at-his-convenience status as the Trivia bank.
6. **`ach_secret_001`'s empty-slot achievement, Museum key-prerequisite exact counts, and final-road puzzle design** remain explicitly "Open" in the Living Bible (§18G/§18J) — the code uses documented, provisional defaults (6-key requirement) that already work correctly; no change made, per "don't invent."
7. **`dlg_museum`/`dlg_hall` narration rows** (0 rows in `15_DIALOGUE` live) — non-blocking (the journey doesn't require them to advance) but were out of scope for this pass; flagged for Ahmed.
8. **Firebase**: confirmed project is `veoulla-world`; no other blocker found beyond the two config fixes already made (§1.5). No deploy attempted, per instruction.

## 5. Confirmation

- **No birthday-event work was implemented.** September 26 content, schedules, and countdown data were left completely untouched; `exhibit_birthday_2026` was explicitly left with its date lock and placeholder content intact.
- **No reset, commit, push, or deployment was performed.**
- Ahmed's own review state and browser windows were not touched; all live-app verification used isolated, freshly-created test player ids on the real Sheet, never `manual_review_player` or any pre-existing save.
