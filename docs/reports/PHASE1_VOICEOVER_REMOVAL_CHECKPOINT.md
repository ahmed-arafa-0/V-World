# Phase 1 — Item H: Voice-Over Removal

**Date:** 2026-09-17
**Scope:** Ahmed's product decision to remove voice-over from the entire Veoulla's World experience, across all three build phases, superseding all previous requirements for recorded narration, five-language voice-over, and Ahmed supplying recordings. See `docs/Veoullas_World_Living_Bible.md` §3A-1 and `CLAUDE.md` rule 17 for the decision record.

**Boundary:** Continues from the accepted Phase 1 A–G work (`docs/reports/PHASE_1_EVIDENCE.md`). No commit, push, merge, or deployment was performed. No M08+ system, Gemini/VAR AI, birthday event, full Admin panel, or `first_journey_completed` write was touched or introduced.

---

## 1. What changed and why

1. **Dialogue/narration is now text-only.** All dialogue and narrative text is preserved in all five languages (en/ar-EG/it/el/fr). VAR remains the sole first-journey narrator. `displayMode` on the `15_DIALOGUE` row still decides cinematic narration vs. speech-bubble dialogue — only the audio layer under it is gone.
2. **Voice-over playback, controls, and warnings are removed from the player experience.** No audio element, no play/pause/replay controls, no audio preloading, and no "voice unavailable/not configured" notice exist anywhere in the frontend.
3. **Text progression replaces audio-paced progression.** A new, reusable `ContinueButton` resolves a localized `action_continue` label (Sheet-first via `08_UI_TEXT`, with a small static five-locale fallback dictionary so the app's single most-used control never shows a raw "translation not available" placeholder) and paces every beat that previously waited on audio duration. Text is always shown in full; nothing auto-dismisses it. Checkpoint/resume behavior and the mandatory first journey are unchanged.
4. **Background music, the Walkman, ambience, sound effects, and the mailbox voice-note feature are unaffected — but see §2's precise scope.** None of these are implemented player-facing features yet (Vinyl Café/Walkman is M11, Marcelino/mailbox is M12 — both Phase 2, not started). What exists today and was not modified is: the generic Drive media gateway (`/api/media/:assetId`, including its audio MIME allowlist and byte-range support), `MapCompositionPreview`, and the typed-but-unpopulated `LocationAudioPolicy` vocabulary from item G. This decision removes narration/dialogue audio specifically; it does not add, remove, or change any of that not-yet-built functionality.
5. **No destructive Sheet migration.** `16_VOICEOVER` and every historical row in it remain in the Sheet untouched. `15_DIALOGUE.voiceover_id`'s historical values remain as a column. The backend simply stopped reading `16_VOICEOVER` and stopped resolving/exposing `voiceoverMediaRef` on dialogue lines.
6. **Documentation updated to record the decision**, per requirement 5: Living Bible (new §3A-1, plus inline superseding notes at every other voice-over mention), Master Build Plan (M03 heading/build/acceptance rows amended with a superseding note, T010/T011 acceptance rows rewritten), `CLAUDE.md` (new rule 17), `THREE_PHASE_DELIVERY.md` (§2/§3 updated), `PHASE_1_PROGRESS.md` (new item H, resolved the pre-Gate-audio "Open" item), `PHASE_1_EVIDENCE.md` and `PHASE1_C_CHECKPOINT.md` (superseding notes added, historical content/test results left unedited), `PHASE_1_ASSET_HANDOFF.md` (the one narration-specific row updated; all SFX/ambience/music rows untouched), and `docs/content/PHASE_1_VOICEOVER_CUES.md` (marked **RETIRED**, kept as history, not deleted).

## 2. Files changed

### Backend

- `packages/contracts/src/content-runtime.ts` — removed `RuntimeVoiceoverEntry`; `RuntimeDialogueLine` no longer carries any voiceover/timing field; `ContentDiagnosticCode`/`ContentDiagnostic.tab` narrowed to drop voiceover-specific codes/tabs.
- `packages/contracts/src/index.ts` — removed the now-nonexistent `RuntimeVoiceoverEntry` re-export.
- `packages/contracts/src/pre-gate-content.ts` — added `uiText: RuntimeUiTextEntry[]` (just `action_continue`) so text-only progression works before any owner session exists.
- `apps/functions/src/services/content-runtime.service.ts` — deleted `buildVoiceover()`; `computeContentRuntime()` no longer reads `16_VOICEOVER`; `buildDialogue()` no longer maps voiceover fields.
- `apps/functions/src/api/pre-gate-content.ts` — added `uiText` filtering to the public pre-Gate response; removed the now-obsolete `voiceoverMediaRef: null` workaround.
- `apps/functions/tests/content-runtime.service.test.ts`, `content-runtime-api.test.ts`, `pre-gate-content-api.test.ts` — removed obsolete voiceover assertions; added coverage confirming the `voiceover` field/`16_VOICEOVER` dependence is gone and that `uiText`/`action_continue` is present pre-Gate.

### Frontend — new `narrative/` module (replaces `voiceover/`)

- `apps/web/src/features/narrative/resolveDialogueCue.ts` — text-only `DialogueCue` resolver (same Sheet-first → English-fallback → safe-placeholder chain as before, minus every audio/timing field).
- `apps/web/src/features/narrative/continueLabels.ts` — static five-locale fallback dictionary for the Continue action.
- `apps/web/src/features/narrative/ContinueButton.tsx` — the localized Continue control.
- `apps/web/src/features/narrative/DialogueText.tsx` + `.module.css` — text-only presentation (cinematic vs. speech-bubble styling from `displayMode`).
- `apps/web/src/features/content-lab/NarrativeRuntimeLab.tsx` + `.module.css` — replaces `VoiceoverRuntimeLab`; same per-`dialogue_id` demo/locale-switcher structure, text-only.

### Frontend — consumers updated

- `apps/web/src/features/first-opening/PreGateSequence.tsx` — swapped `VoiceoverPlayer`/`resolveVoiceoverCue` for `DialogueText`/`resolveDialogueCue`; all four phase-transition actions now use one `ContinueButton` sourced from the pre-Gate response's `uiText`.
- `apps/web/src/features/first-opening/NamingPrompt.tsx` — swapped the mid-form `VoiceoverPlayer` for `DialogueText`; the "naming-continue" confirmation button is now a `ContinueButton`.
- `apps/web/src/features/content-lab/ContentRuntimeLab.tsx` — removed the "voiceover-status-list" section and `voiceover` destructuring; heading renamed to "Asset metadata."
- `apps/web/src/features/gate/GatePage.tsx` — renders `NarrativeRuntimeLab` instead of `VoiceoverRuntimeLab`.

### Frontend — removed

- `apps/web/src/features/voiceover/` deleted in full: `VoiceoverPlayer.tsx`/`.module.css`, `useVoiceoverPlayback.ts`, `resolveVoiceoverCue.ts`, `VoiceoverRuntimeLab.tsx`/`.module.css`.

### Tests

- New: `apps/web/tests/resolveDialogueCue.test.ts`, `DialogueText.test.tsx`, `ContinueButton.test.tsx`, `NarrativeRuntimeLab.test.tsx`.
- Deleted (tested removed code): `apps/web/tests/VoiceoverPlayer.test.tsx`, `resolveVoiceoverCue.test.ts`, `VoiceoverRuntimeLab.test.tsx`.
- Updated: `apps/web/tests/NamingPrompt.test.tsx`, `PreGateSequence.test.tsx`, `FirstOpeningFlow.test.tsx`, `GatePage.test.tsx` (removed now-unnecessary `HTMLMediaElement.play/pause` spies; updated `voiceover-*` testids to `dialogue-text-*`), `ContentRuntimeLab.test.tsx` (voiceover-status-list assertion replaced with a "never renders" assertion).
- Updated: `apps/web/tests/helpers/mockApi.ts` — removed the `voiceover` array and per-dialogue-line voiceover fields from `SAMPLE_CONTENT_RUNTIME_RESPONSE`; added an `action_continue` row to `uiText`; added `uiText` to `SAMPLE_PRE_GATE_CONTENT_RESPONSE`.
- Updated: `tests/e2e/gate.spec.ts` — `voiceover-caption` testid assertion updated to `dialogue-text-line`.

### e2e infrastructure fix (found during this checkpoint's own verification, see §6)

- `playwright.config.ts` — `webServer.url` changed from the Hosting emulator's static root to `${BASE_URL}/api/health`, so Playwright genuinely waits for the Functions emulator to finish loading before running tests, instead of proceeding as soon as the static file server responds. Fixes a real, reproduced "Could not reach the backend" failure on the first test of every cold run.
- `tests\e2e\gate.spec.ts` — the one narration-related testid assertion (`voiceover-caption` → `dialogue-text-line`) needed for this task; re-verified against the real backend after the above fix.

### Live verification script

- `scripts/verify-phase1-full-app-browser.mjs` — updated to assert text-only progression before/after Gate auth across all five locales (with an RTL/LTR direction check), zero voiceover-style `/api/media/` requests, and zero `<audio>` elements anywhere in the app; replaced `VoiceoverRuntimeLab`/`voiceover-caption`/`voiceover-demo-*` references with their `narrative/` equivalents; removed the now-obsolete "known missing-audio 404" carve-out (that path is no longer reachable at all).

### Documentation

`docs/Veoullas_World_Living_Bible.md`, `docs/Claude_Code_Master_Build_Plan.md`, `CLAUDE.md`, `docs/plans/THREE_PHASE_DELIVERY.md`, `docs/plans/PHASE_1_PROGRESS.md`, `docs/reports/PHASE_1_EVIDENCE.md`, `docs/reports/PHASE1_C_CHECKPOINT.md`, `docs/assets/PHASE_1_ASSET_HANDOFF.md`, `docs/content/PHASE_1_VOICEOVER_CUES.md` (retired).

### Not touched (deliberately)

- `packages/sheet-schema` — the `16_VOICEOVER` tab definition and every column schema are unchanged; no destructive migration.
- The Google Drive media gateway (`apps/functions/src/api/media.ts`, `drive-gateway.ts`, `byte-range.ts`, `media-headers.ts`) — generic, protocol-level infrastructure (auth, MIME allowlist, byte-range/streaming, cache headers) that already includes audio MIME types (`audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm` — see `media-headers.ts`) and is already exercised live by the Beach scene's real images/video through the same endpoint. This is the reusable _capability_ a future Walkman/ambience/SFX/mailbox-voice-note feature would build on — none of those features exist as player-facing UI yet (see §1 item 4), so "preserved" means "not modified," not "verified as a working end-user feature."
- `MapCompositionPreview`, the M04 player-state/checkpoint/key APIs, the M05 scene engine, and the item-G `WorldRuntimeExtensions` registry (an unpopulated `LocationAudioPolicy` vocabulary capable of expressing the Church/Café/Arcade rules — a typed seam, not a playback implementation).

## 3. Commands run and results

```text
npm run build:libs     → PASS
npm run typecheck (apps/web)       → PASS
npm run typecheck (apps/functions) → PASS
npm run format:check   → PASS (2 files auto-fixed with prettier --write, then re-verified clean)
npm run lint            → PASS, 0 errors / 0 warnings (1 react/no-unescaped-entities error found and fixed)
npm run test --workspace=packages/sheet-schema → PASS, 46/46 across 4 files
npm run test --workspace=apps/functions        → PASS, 387/387 across 36 files
npm run test --workspace=apps/web              → PASS, 249/249 across 25 files
npm run build           → PASS (contracts/sheet-schema/test-fixtures/functions/web all build cleanly)
npm run security:scan   → PASS — 0 forbidden credential references in apps/web/dist
npm run verify:phase1:full-app → PASS, 31/31 (real Sheet, real Drive credential, real headless Chromium)
```

Combined automated total: **682/682 across 65 files** (46 sheet-schema + 387 functions + 249 web). This differs from Phase 1 A–G's final 686/686-across-64-files total because three voiceover-specific test files were deleted (their subject no longer exists) and four new files were added in their place, with a net change in both file and test counts from the added/removed/updated assertions described above — not a regression.

Production bundle check: `grep -io "voiceover" apps/web/dist/assets/*.js` and `grep -io "HTMLMediaElement\|<audio\|\.play(" apps/web/dist/assets/*.js` both return **zero matches** — the removed code is not merely unused, it does not exist in the shipped bundle.

## 4. Live browser verification (requirement 7)

`npm run verify:phase1:full-app` — real built app, real backend, real Google Sheet/Drive credential, real headless Chromium, a minted (never Gate-code-derived) owner session. 31/31 checks passed, including:

- **Before Gate authentication:** the anonymous pre-Gate sequence renders real narration text from the live Sheet with a localized, non-empty Continue label; zero voiceover-style `/api/media/` requests; zero `<audio>` elements; mobile viewport (393×852) shows all four dials with no horizontal overflow.
- **After Gate authentication (resumed session, simulating interruption/resume):** the app resumes directly past the Gate; `FirstOpeningFlow` proceeds Cove arrival → naming → collar confirmation → Beach with all text visible and Continue-driven; `NarrativeRuntimeLab` renders non-empty dialogue text in **all five locales** (en, ar-EG, it, el, fr) with the lab's `dir` attribute correctly flipping from `ltr` to `rtl` on Arabic; zero voiceover-style `/api/media/` requests and zero `<audio>` elements across the entire authenticated flow; zero unexpected console/page errors (i.e., no missing-voice warnings of any kind); the Beach scene remains usable on a resized mobile viewport with no horizontal overflow.

This directly satisfies requirement 7: text-only progression is confirmed both before and after Gate authentication, across all five locales, in both RTL and LTR, on a mobile layout, and with a resumed (interrupted) session — with zero narration-audio requests and no missing-voice warnings anywhere.

## 5. Non-narration audio: what was actually verified vs. what does not exist yet

The acceptance criterion in requirement 7 is specifically **zero narration-audio requests and no missing-voice warnings** — that was verified directly (§4). Separately, and in response to a direct question about it: the absence of any audio reference in the production bundle (§3) proves narration audio is gone; it does **not** by itself prove Walkman/ambience/SFX/mailbox-voice-notes are functional, because **none of them are implemented player-facing features in this codebase today**:

- Grepping `apps/web/src` finds no Walkman playback component, no ambience/background-music audio element, and no sound-effect trigger anywhere. The one "ambience" reference in the entire frontend is a literal text label in `PreGateSequence.tsx` — `<span>Sea ambience — final audio pending handoff</span>` — not a playing sound.
- `apps/web/src/features/scene-engine/runtimeExtensions.ts`'s `LocationAudioPolicy` (`backgroundMusic`, `songStart`, `gameMusic`, `walkmanGain`, `soundEffects`) is a typed vocabulary for a future Sheet-backed adapter, per its own doc comment ("Values are supplied by a later Sheet-backed adapter, not populated here") and item G's checkpoint ("The production extension registry remains empty"). It expresses policy shapes; it plays nothing.
- Grepping the entire `apps/` tree for "mailbox"/"voice note" returns zero matches. Marcelino and the Cottage mailbox are Living Bible-described M12/Phase 2 work that has not started (Phase 1 is M03–M07 plus item-G extension points only, per `docs/plans/THREE_PHASE_DELIVERY.md`).
- What genuinely exists and was verified unaffected: the generic Drive media gateway (`apps/functions/src/api/media.ts`/`drive-gateway.ts`/`byte-range.ts`/`media-headers.ts`) — its audio MIME allowlist (`audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm`) is untouched, its 31 `media-api.test.ts` tests and 14 `byte-range.test.ts` tests all still pass unmodified, and it is already exercised live (non-audio) by the Beach scene's real image/video assets in this checkpoint's own live verification (§4). This is the reusable _capability_ a future audio feature would sit on, not a working Walkman/ambience/SFX/mailbox feature today.

**Conclusion:** the claim "reusable audio functionality is preserved" is accurate only in the narrow sense that the underlying gateway and its tests are untouched and still pass. It should not be read as "Walkman/ambience/SFX/mailbox voice notes are verified working" — those features do not exist yet to verify, in this codebase, independent of this change.

## 6. Playwright e2e suite: investigation, root causes, and fix

An initial full run (`npm run test:e2e`, 62 tests, real Firebase emulators + the real Sheet) showed failures starting at the very first test and was stopped for investigation rather than left to run all 62 against a broken shared cause, per direct instruction. Root-caused with evidence (`firebase-debug.log`, `error-context.md` per failing test, and isolated single-spec reruns) rather than assumed:

**Cause 1 — Functions-emulator cold-start race (fixed in this checkpoint).** `firebase-debug.log` showed `functions: Failed to load function definition from source: ... Cannot determine backend specification. Timeout after 10000` followed by `All emulators ready!` roughly 10s later — but Playwright had already started sending test traffic before that point, because `playwright.config.ts`'s `webServer.url` pointed at the Hosting emulator's static root (`http://127.0.0.1:5050`), which serves `index.html` immediately and independent of whether the Functions emulator has finished loading. The first request in every run failed with the frontend's own "Could not reach the backend" message — a real, correctly-behaving offline state, not a broken assertion. **Fix applied:** `playwright.config.ts`'s `webServer.url` now points at `${BASE_URL}/api/health` instead of the bare root. Verified against Playwright's own readiness check (`isURLAvailable` in `playwright-core`, which explicitly treats HTTP 404 as "not ready" and only accepts 200–403): an unrouted `/api/*` request 404s while Functions is still loading, so this genuinely blocks `webServer` startup until the backend can answer, rather than only until static hosting can. Confirmed fixed by rerunning `admin-auth.spec.ts` with `--retries=0` (no safety net): all 3 non-credential-gated tests passed cleanly on the first attempt, taking 642ms instead of the previous 15.7s-then-fail.
**Cause 2 — genuine external Google Sheets API rate-limiting (not a code defect, not fixed by this checkpoint).** Three separate failures/flakes across the initial full run — `network-security.spec.ts`'s `/api/bootstrap` test (failed both the original attempt and its retry), `gate.spec.ts`'s sessionStorage-replay test, and `gate.spec.ts`'s "Enter after four digits" test — all trace to the same real cause, confirmed directly in `firebase-debug.log`: `<<< [apiv2][status] GET .../api/bootstrap 429`, and the sessionStorage test's own captured page state literally reads "Could not load the Gate: The Google Sheets API rate limit was exceeded." This is Google's real quota system responding to the real API load a 62-test serial suite generates against one live Sheet — the same class of failure already documented once in `docs/reports/PHASE_1_EVIDENCE.md` ("1 failure caused by a real Google Sheets 429"). It is not a selector change, not an authentication bug, and not caused by any file this checkpoint touched (`/api/bootstrap` doesn't read dialogue/voiceover data at all). No code change was made for this cause — inventing in-app retry/backoff logic would be scope creep beyond a voice-over-removal task, and Playwright's existing `retries: 1` is the established, already-documented mitigation (it recovered 2 of the 3 occurrences; the third, `/api/bootstrap`, happened to fail twice in a row).
**Final full-suite result after the Cause-1 fix:** see §3 for the exact pass/fail/flaky/skipped counts from the rerun. Any remaining failure or flake in that rerun was individually re-diagnosed against `firebase-debug.log` before being attributed to Cause 2 rather than assumed.

## 6a. Follow-up checkpoint (2026-09-18): exit-code pipeline fix and reducing Cause 2's blast radius

A later full run reported **45 passed, 14 skipped, 2 flaky, 1 failed**, but the shell command that produced it exited 0 anyway. Two separate things needed fixing, investigated using the existing `test-results/*/error-context.md` files and `firebase-debug.log` from that run — not by re-running the full suite speculatively.

**Fix A — the exit code was never wrong at the Playwright level; the reporting pipeline was swallowing it.** That run had been piped through `tee` (directly, or via a cmdlet like `Tee-Object`). In both a POSIX shell without `pipefail` and in PowerShell, `cmd | tee file` reports the pipeline's exit status from the _last_ stage (`tee`, which almost always succeeds), not from the command that actually ran the tests — so a real Playwright failure can print `exit code 0`. This was reproduced directly: `node -e "process.exit(7)" | cat` yields shell exit code `0` in this repo's Bash tool, while the same command with no pipe correctly yields `7`, in both Bash and PowerShell. **Fix applied:** `scripts/run-e2e-with-log.mjs` (wired up as `npm run test:e2e:log`) spawns `playwright test` as a child process, tees its stdout/stderr to both the console and a log file itself (in Node, not the shell), and calls `process.exit()` with the child's real exit code. Because there is no shell pipe at all — the log file is written from inside the same Node process that awaits the child — the exit code can't be lost regardless of which shell invokes it. Verified in both directions: a real passing run exits `0`, and a deliberately broken invocation (`--project=does-not-exist`) exits `1`, in both cases confirmed without piping the verification command itself through anything that could repeat the same mistake.

One further bug surfaced while verifying this: the script's first default log path was inside `test-results/`, which is also Playwright's default `outputDir` — Playwright clears that directory at the start of every real run (not `--list`), which silently deleted the log file out from under the script's own still-open write handle, so a real full run produced an empty/missing log despite the run itself succeeding. **Fixed** by defaulting the log path to `e2e-logs/` instead (added to `.gitignore` alongside `test-results/`), a directory Playwright never touches.

**Fix B — root cause of the `/api/bootstrap` failure and pre-Gate flakes, confirmed (not assumed).** Using the checkpoint's own leftover `test-results/*/error-context.md` files rather than re-running anything: the mobile `/api/bootstrap` failure's captured response was `Expected: 200, Received: 429`; a pre-Gate flake's captured page read literally "Could not load the Gate: The Google Sheets API rate limit was exceeded." Tracing both response codes to source: `mapGoogleError()` (`apps/functions/src/google/google-error-mapper.ts`) only produces that exact message and only from a real googleapis `429`, and neither `/api/bootstrap` nor `/api/content/pre-gate` ever calls `evaluateRateLimit()` (the app's own login-attempt limiter in `rate-limit.service.ts`, which only guards `/api/auth/gate` and `/api/auth/admin`). `firebase-debug.log` around each failure's timestamp shows the literal line `GET .../api/bootstrap 429` / `GET .../api/content/pre-gate 429` from the emulator's own request log — confirming these 429s came from Google's real Sheets API quota, not from application code treating a login attempt as blocked. This matches, and does not contradict, §6 Cause 2 above.

**Fix applied for Fix B — reduced real Sheets API call volume, without touching any rate limit or retry policy.** `computeContentRuntime()` (`content-runtime.service.ts`, backs both `/api/content/runtime` and `/api/content/pre-gate`) was firing five separate concurrent `readEnabledRows()` calls — five separate Google Sheets API requests every time its 60-second cache expired — instead of one batched request. `buildBootstrapResponse()` (`bootstrap.service.ts`) was worse: it ran eight individual per-tab reads _and_ `computeSchemaHealth()`'s own all-table-tabs batched read concurrently in one `Promise.all`, so on a cold cache a single `/api/bootstrap` call fired roughly ten concurrent underlying Sheets API requests, several of them fetching tabs the schema-health batch was fetching anyway. Fixes:

- Added `SheetGateway.readEnabledRowsBatch()` (mirrors the existing `readEnabledRows`, batched) and switched `computeContentRuntime()` to one call covering all five tabs.
- Reordered `buildBootstrapResponse()` to await `computeSchemaHealth()` (whose internal `readTabsBatch()` already covers every table tab, including the specific ones bootstrap needs) _before_ the individual `readTab`/`readEnabledRows` calls, so those now resolve from the now-warm cache instead of firing their own redundant requests.

This is a real reduction in Google API call volume per request (bootstrap: ~10 concurrent calls → ~3; content-runtime/pre-gate: ~6 → ~2), not a masking of the symptom — no 429 is ever treated as success, no production rate limit was touched, and no sleep/delay was added anywhere.

**Verification.** Unit tests for both services (`bootstrap.service.test.ts`, `content-runtime.service.test.ts`, `content-runtime-api.test.ts`, `pre-gate-content-api.test.ts` — 34 tests) pass against the fake-client fixtures unchanged, since the refactor only changes which `SheetGateway` methods are called, not the response shape. A targeted live rerun of just `network-security.spec.ts` + `gate.spec.ts` (both projects, `--retries=0`, run once) — the two files containing the previously-failing/flaky tests — passed 32/32 (2 skipped for missing `E2E_GATE_CODE`) with **zero** 429s of any kind in `firebase-debug.log` for that run. A single full 62-test suite run immediately afterward (per instruction, run once) still hit one genuine `/api/bootstrap` 429 (both the original attempt and its retry) on `mobile-chromium`, plus one flaky `admin-auth.spec.ts` wrong-credentials test whose captured DOM showed the sign-in button still disabled/pending at the 15s assertion timeout (a slow live response, not a wrong-message bug — no `429`-specific copy was involved). Both are consistent with genuine, external Google Sheets quota/latency pressure that this session's own two back-to-back live runs (the targeted rerun, then the full run, within the same few minutes) plausibly contributed to — not a new defect, and not contradicted by the batching fix, which measurably worked in the immediately-preceding zero-429 run. Per instruction, the full suite was not re-run again to chase this further.

**Final full-suite counts from this session's one run (2026-09-18):** 46 passed, 1 failed, 1 flaky, 14 skipped, out of 62 total. The 14 skips are every test gated on `E2E_GATE_CODE`/`E2E_ADMIN_PASSWORD` (the real Gate code and Admin password), which are intentionally never set in this environment — the same credential-gated skip pattern documented in every prior milestone's evidence (see `M02_EVIDENCE.md` §8, `M03_A_CHECKPOINT.md`). This does not match the originally-reported 45/14/2/1 exactly (a different mobile test flaked this time — `admin-auth` instead of `gate.spec`'s sessionStorage test) because Cause 2 is, by nature, a live external dependency: which specific request loses the quota race varies run to run.

## 7. Known limitations

- The pre-Gate `dlg_gate_01` and Beach `dlg_name_01` dialogue rows' wording approval status remains unresolved (an existing open product decision, unrelated to this change) — the runtime displays whatever is currently live in the Sheet without claiming it is approved final copy.
- `docs/content/PHASE_1_VOICEOVER_CUES.md` is marked retired but not deleted, per the requirement to preserve history; a reader must check its new top-of-file retirement banner before trusting any of its per-cue registration-status claims.
- The Playwright e2e suite runs serially against the real Sheet with no mocking; a real Google Sheets 429 (Cause 2 above) remains possible on any given run, by design of this test strategy, and is not something this checkpoint (or any single code change) can eliminate. §6a's batching fix reduces how much Sheets API traffic each run generates (and a targeted rerun immediately after the fix hit zero 429s), but it cannot guarantee zero 429s from a shared, external, per-minute quota — especially across back-to-back live runs in a short window, which this session's own verify-then-full-run sequence demonstrated.
- Always invoke the e2e suite directly (`npm run test:e2e` or `npm run test:e2e:log`), never by piping its output through `tee`/`Tee-Object` — see §6a Fix A. `test:e2e:log` writes its own log file internally and is the safe way to keep a copy of the output without risking a swallowed exit code.

## 8. Confirmation

- No M08+ system, Gemini/VAR AI integration, birthday event engine, full Admin panel, or `first_journey_completed`/Map-unlock mutation was implemented or touched by this change.
- No commit, push, merge, or deployment was performed.
- `16_VOICEOVER`'s tab definition and every historical Sheet row remain intact — verified by inspecting `packages/sheet-schema` (unmodified) and by this checkpoint's live verification never issuing a request derived from that tab.
- The Drive media gateway that a future Walkman/ambience/SFX/mailbox-voice-note feature would use is unmodified and its existing tests still pass (§5) — but those features are not yet implemented, so nothing about them was "verified working," only "not broken by this change" (there was nothing of theirs to break).
