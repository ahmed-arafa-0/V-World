# Veoulla's World — Claude Code Master Build Plan

**Status:** Execution blueprint  
**Version:** 1.1  
**Date:** 2026-09-04  
**Implementation:** Claude Code  
**Project management and acceptance review:** ChatGPT  
**Product owner and real-device testing:** Ahmed

## 1. Governing Inputs

Claude must treat these artifacts as the current authority, in this order:

1. `Veoullas_World_Living_Bible.md`
2. `Veoullas_World_Google_Sheets_Blueprint.xlsx`, after import into Google Sheets
3. The prompt for the current milestone
4. Existing code and tests from previously accepted milestones

If a prompt conflicts with the Living Bible, Claude must stop and report the exact conflict. Old prototype code, screenshots, or ideas must not silently override the new Bible.

## 2. Delivery Method

- Claude receives only one milestone prompt at a time.
- Claude must not implement later milestones early.
- Every milestone ends in a runnable build, automated checks, and a short evidence report.
- Ahmed tests the defined acceptance path on a real desktop browser and a real mobile browser.
- ChatGPT reviews Claude's changed files, test output, screenshots/video, console output, and Sheet writes.
- A milestone is accepted only after its blocking acceptance criteria pass.
- Failed acceptance returns to the same milestone; do not continue while a foundational defect remains.

## 3. Target Architecture

### 3.1 Frontend

- React + Vite + TypeScript.
- Firebase Hosting with SPA rewrite to `/index.html`.
- CSS Modules for local component styling.
- Zustand for shared runtime state.
- React Router for application/Admin routes.
- Framer Motion for UI transitions.
- GSAP timelines for authored cinematic camera and scene sequences.
- HTML/CSS/SVG/Canvas as appropriate for interactive layers; do not introduce a full 3D engine without a separately approved reason.
- First-person 2.5D layered scenes outside the living Map.

### 3.2 Backend

- A server-side Firebase function layer—or equivalent Firebase-compatible serverless layer—sits between React and Google Sheets.
- React never reads or writes the private spreadsheet directly.
- The backend reads the Google credential from a separate server-only configuration file supplied by Ahmed.
- The private spreadsheet contains the temporary plaintext Gate code, Admin password, and third-party service keys by Ahmed's explicit prototype decision.
- The backend captures the incoming IP and writes access events to `05_ENTRY_LOGS`.
- Google Sheets remains authoritative for configuration, content, story progress, keys, achievements, messages, events, character state, Farm state, scores, exhibits, sessions, and logs.
- Firebase Storage is not used. Media binaries are stored under one asset root in Ahmed's primary Google Pro account's Google Drive.
- The backend owns all Google Drive API access and exposes a same-origin media gateway with content type, ETag/cache headers, and HTTP byte-range support for audio/video. React receives application media URLs/IDs, never Drive credentials or OAuth tokens.
- The Google backend identity must be shared into both the private Sheet and the approved Drive asset root. Support a backend-only Drive-owner OAuth credential only if service-account folder access is insufficient.
- Browser storage is a cache and pending-write queue, not the permanent source of truth.
- No Firestore or other database may become an unapproved parallel source of truth.

### 3.3 Sheet Gateway

Create one typed repository/gateway layer. React components and game systems must never know raw cell coordinates.

Required responsibilities:

- map each workbook tab to a typed entity;
- validate required columns and row values;
- cache read-heavy configuration for a short configurable TTL;
- bypass cache after Admin changes when requested;
- append logs safely;
- update records by stable primary key;
- support idempotency keys for rewards, messages, story completion, and event completion;
- serialize or retry conflicting writes;
- return explicit error codes instead of raw Google errors;
- preserve unknown future columns;
- emit schema-health diagnostics for Admin.

### 3.4 API Surface

Exact route naming may change, but these capabilities are required:

| Capability | Method | Purpose |
| --- | --- | --- |
| Bootstrap | GET | App config, languages, active versions, essential icons/assets, current time/event phase |
| Gate entry | POST | Validate four dials server-side, create session, log result/IP |
| Admin entry | POST | Validate separate Admin credentials and create Admin session |
| Session | GET/DELETE | Resume, heartbeat, or end a session |
| Content bundle | GET | Location/story/event content by version and locale |
| Player state | GET | Consolidated Sheet-authoritative progress for Veoulla |
| Progress write | POST | Checkpoint or complete a story beat idempotently |
| Reward transaction | POST | Award/spend a key or claim an achievement once |
| Message transaction | POST | Delivery/read/archive/translation/voice/gift state |
| Farm transaction | POST | Plant, water, weather-water, wilt, recover, harvest |
| Arcade result | POST | Save score, best result, achievement, and eligible reward |
| Character transaction | POST | VAR name/gender/memory and Marcelino learning/delivery state |
| Event transaction | POST | Start/checkpoint/complete/replay birthday beats |
| Admin data | GET/POST | Flags, simulated time, content status, log viewer, health diagnostics |
| Media | GET/HEAD | Resolve and stream an approved Drive asset with caching and byte ranges |
| VAR conversation | POST | Build a governed Gemini request, return VAR's response, and persist approved memory summary |

### 3.5 Data Reliability

- Generate a unique transaction ID for every mutation.
- Before awarding a one-time reward, check existing player rows and transaction ID.
- A retry returns the original successful result instead of duplicating it.
- Queue a failed mutation locally with its transaction ID.
- Retry safely after reconnect.
- The UI may continue past final Map unlock if the Sheet is temporarily unavailable, but must display pending sync in Admin diagnostics and reconcile later.
- Server timestamps are authoritative for daily key limits and birthday phases.

## 4. Repository Structure

```text
veoullas-world/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  ├─ components/
│  │  │  ├─ features/
│  │  │  │  ├─ access/
│  │  │  │  ├─ admin/
│  │  │  │  ├─ arcade/
│  │  │  │  ├─ birthday/
│  │  │  │  ├─ characters/
│  │  │  │  ├─ church/
│  │  │  │  ├─ cottage/
│  │  │  │  ├─ farm/
│  │  │  │  ├─ map/
│  │  │  │  ├─ museum/
│  │  │  │  ├─ navigation/
│  │  │  │  ├─ progression/
│  │  │  │  ├─ scenes/
│  │  │  │  ├─ vinyl-cafe/
│  │  │  │  └─ walkman/
│  │  │  ├─ i18n/
│  │  │  ├─ media/
│  │  │  ├─ services/
│  │  │  ├─ state/
│  │  │  ├─ styles/
│  │  │  ├─ types/
│  │  │  └─ utils/
│  │  └─ public/
│  └─ functions/
│     ├─ src/
│     │  ├─ api/
│     │  ├─ auth/
│     │  ├─ sheets/
│     │  ├─ transactions/
│     │  ├─ logging/
│     │  └─ validation/
│     └─ config-private/
│        └─ google-service-account.json
├─ packages/
│  ├─ contracts/
│  ├─ sheet-schema/
│  └─ test-fixtures/
├─ docs/
│  ├─ Veoullas_World_Living_Bible.md
│  ├─ sheet-tab-contracts.md
│  ├─ acceptance-evidence/
│  └─ runbooks/
├─ firebase.json
└─ package.json
```

`config-private/google-service-account.json` must never be imported by the web app. Claude must add a guard/test that fails if anything under `config-private` is reachable from the frontend dependency graph.

## 5. Global Definition of Done

Every milestone must satisfy all applicable items:

- TypeScript build passes without ignored errors.
- Lint passes.
- Unit/integration tests added for new decision logic and pass.
- No new console errors during the acceptance path.
- Sheet requests go through the typed backend gateway.
- New state is stored in the correct Sheet tab and survives refresh/new browser session.
- Reward mutations are idempotent.
- Desktop and mobile layouts are usable.
- English, Egyptian Arabic, Italian, Greek, and French data structures work.
- Arabic uses RTL and the other four languages use LTR.
- Voice-over has synchronized captions and a silent/missing-file fallback.
- Keyboard, mouse, touch, and reduced-bandwidth behavior do not trap the user.
- Interrupted cinematics resume at a safe checkpoint.
- Evidence includes commands run, test output, screenshots for desktop/mobile, Sheet rows written, and known limitations.

## 6. Milestone Sequence

## M00 — Project Skeleton and Quality Gates

**Goal:** Establish a clean, runnable monorepo without world content.

**Build**

- Create the repository structure.
- Configure React/Vite/TypeScript and the serverless backend.
- Configure Firebase Hosting rewrite and local emulators.
- Add formatting, linting, unit tests, and end-to-end test harness.
- Add environment validation and a server-only Google credential loader.
- Add a frontend import-boundary test for private backend config.
- Create placeholder `/`, `/admin`, and health endpoints.

**Acceptance**

- Web app loads locally and through Hosting emulator.
- Direct SPA route refresh works.
- Backend health returns structured JSON.
- Missing Google credential produces a clear backend-only error.
- Frontend build contains no private credential path or content.
- CI-quality commands pass from a clean checkout after the private file is supplied.

## M01 — Google Sheets Gateway and Schema Health

**Goal:** Make the workbook the application data source before building world screens.

**Build**

- Import the workbook into one private Google Sheet.
- Implement typed contracts for all 42 tabs.
- Implement cached reads, primary-key update, append, batch read, and idempotent mutation helpers.
- Add schema validation, duplicate-ID checks, invalid-reference diagnostics, and Admin-readable health output.
- Read prototype plaintext service values only on the backend.
- Add mock Sheet fixtures for automated tests.
- Resolve Drive asset metadata from Sheet rows without downloading media in the content gateway.

**Acceptance**

- Bootstrap returns config, five languages, eight locations, 18 story beats, icons, and current event.
- Updating a Sheet config value changes the API response after cache expiry/bypass without rebuilding React.
- Invalid/missing columns produce a diagnostic and safe API error.
- Browser network responses never contain the Google credential or unrelated plaintext service keys.
- Append/update tests prove stable primary-key behavior.

## M02 — Gate Access, Admin Access, Sessions, IP Logs

**Goal:** Implement separate Veoulla and Admin entry flows.

**Build**

- Four-dial Gate-code API using the active plaintext Sheet value.
- Separate Admin login using the Admin plaintext Sheet value.
- Opaque server-created session IDs and expiry.
- Session resume/heartbeat/logout.
- Server-side IP capture and append-only `05_ENTRY_LOGS` writes.
- Log page open, Gate failure/success, Admin failure/success, session resume/end.
- Basic rate/cooldown configuration from Sheets even if security hardening is deferred.

**Acceptance**

- Correct and incorrect Gate attempts behave differently and create correct log rows.
- Logged IP equals the server-observed request IP/proxy-aware value, not a client-supplied field.
- Admin password never appears in frontend responses or logs.
- Refresh resumes a valid session.
- Expired/terminated session returns safely to the appropriate entry.

## M03 — Localization, Direction, Icons, Assets, and Voice-over Runtime

**Goal:** Build the content layer all later scenes reuse.

**Build**

- Load normalized UI/dialogue/voice rows from Sheets.
- Language switcher for five locales.
- Document and component RTL/LTR rules.
- Icon registry and asset registry driven by Sheet asset IDs and Google Drive file IDs.
- Backend Drive media gateway with authorization, MIME validation, `GET`/`HEAD`, byte ranges for audio/video, cache headers, and clear missing/disabled-asset responses.
- Service-worker/browser caching for already-viewed immutable asset versions; cache invalidation when the Sheet asset version changes.
- Voice-over player with captions, timing, pause/replay, and missing-file fallback.
- Browser autoplay attempt plus one minimal enable-audio action if blocked.
- Preload priority and mobile asset selection.

**Acceptance**

- One test screen switches through all five languages without reload.
- Arabic layout/captions are RTL; EN/IT/EL/FR remain LTR.
- Back-direction icon mirrors only when its Sheet row says so.
- Changing an icon/audio Drive file ID or asset version in Sheets changes the rendered asset after refresh.
- Missing audio still shows the full caption and does not block progress.
- Video/audio seeking works through byte-range responses, and no Drive credential/token appears in browser responses.

## M04 — Player State, Checkpoints, Keys, and Idempotent Rewards

**Goal:** Establish all progression before story visuals depend on it.

**Build**

- Load and reconcile `24_PLAYER_PROGRESS`, `25_PLAYER_KEYS`, achievement, message, character, Farm, score, and exhibit state.
- Local read cache and pending transaction queue.
- Checkpoint, completion, key award/spend, and achievement claim APIs.
- Same-key daily limit using server/event timezone.
- Replay protection and transaction IDs.

**Acceptance**

- Story checkpoint survives refresh and another device/browser after backend sync.
- Awarding the same transaction twice changes quantity once.
- Found, spent, and available key quantities remain consistent.
- A second same-shape key on the same authoritative day is rejected when capped.
- Pending offline mutation reconciles without duplication.

## M05 — Scene Engine, Camera, Movement, and Overlapping Connectors

**Goal:** Prove the world construction technique before producing every building.

**Build**

- Reusable layered 2.5D scene renderer.
- Parallax layers, responsive crops, real-video layer, particles, interactive hotspots, and diamond markers.
- Bounded first-person looking and rail/node movement.
- Keyboard/mouse/drag/touch/click-to-point inputs.
- Scene transitions hidden by authored occluders.
- A prototype chain: Beach focus → Beach + three steps → near steps + Church approach → Church focus.
- Debug overlay showing scene/node/bounds/checkpoint, disabled in production.

**Acceptance**

- Desktop and mobile preserve geographic direction without exposing blank canvas.
- Exactly three literal steps are visible.
- The previous scene remains partially visible while the next is introduced.
- Camera cannot rotate beyond prepared art.
- Manual and automatic movement reach the same authored node.
- Interrupted guided movement resumes safely.

## M06 — First Opening: Bootstrap and Gate

**Goal:** Implement beats 01–04 from Sheets.

**Build**

- Black/ocean opening, opening line, logo, Gate reveal.
- Default English start.
- Unseen VAR narration and later visual reveal.
- Four interactive dials and subtle wrong-attempt response.
- Correct-code slow doors, widening light, rising music, VAR jump, player follow.
- Save checkpoints around validation and transition.

**Acceptance**

- All text/voice/assets/code come from Sheets.
- Wrong code shakes/sounds but does not leak correct code.
- Correct entry does not require re-entry after refresh in a valid session.
- Blocked autoplay shows the minimal audio gesture.
- Mobile Gate controls are comfortably operable.

## M07 — Marevi Cove, Naming, and Three Steps

**Goal:** Implement Beach arrival and VAR naming/gender choice.

**Build**

- Wide arrival cinematic settling into first person.
- Real ocean loop, waves toward camera, dock/boat/loungers/umbrellas/sitting area/shells/lantern.
- Approved progressive Beach interactions.
- VAR name/gender dialogue and magical collar update.
- Shell-key introductory rule.
- Connector toward the three steps.

**Acceptance**

- Name/gender write to `37_CHARACTER_STATE` and survive reload.
- Renaming later updates collar, Cottage place, and Settings consistently.
- Beach interaction/key award is Sheet-driven and idempotent.
- Ocean video has poster/fallback and acceptable mobile performance.

## M08 — Church

**Goal:** Implement the complete respectful Church system and first-journey beat.

**Build**

- Exterior connector and complete interior.
- Absolute Walkman/music stop on entry.
- Verse/message, Bible story gallery, daily quizzes, candle corner, personal photo/story.
- Reviewed-source fields and disabled-unapproved content handling.
- Candle/quiz key rules and achievements.
- Dated content with multiple story images.

**Acceptance**

- Walkman resumes according to prior state after exit but is silent inside.
- Unapproved Church content never displays.
- Quiz answer/explanation/reference/retry work in five languages.
- Replay cannot duplicate the candle key or achievement.
- Ordinary/special candle persistence follows Sheet flags.

## M09 — Vinyl Café and Walkman

**Goal:** Implement music catalog, dated releases, request flow, and persistent playback.

**Build**

- Café exterior/interior and gramophone/vinyl presentation.
- Browsable catalog, one or multiple dated releases, retained past songs.
- Drink and song-explanation interactions.
- Walkman unlock during first journey and persistent playback outside Church.
- Song request written for Admin review.
- Music-note key rule.

**Acceptance**

- Café entry does not autoplay a song.
- Selected song continues across location routes.
- Walkman volume lowers during games and restores afterward.
- Multiple songs on one date display correctly.
- Request appears in Admin data without automatic catalog publication.

## M10 — VARcade

**Goal:** Implement the room, progression, scoreboard, and launch game set.

**Build**

- One row of cabinets; three installed initially, five supported.
- Machine locks from key/progress rules.
- Implement launch games in approved order chosen from memory, catching, puzzle, maze with VAR, and trivia.
- Adaptive difficulty, unlimited attempts, personal bests, recent improvement, achievements.
- Game SFX only; no game music; reduced Walkman.

**Acceptance**

- First visit exposes exactly the configured machine and locks the others.
- Score and difficulty persist in Sheets.
- Reward occurs once per eligible period despite unlimited attempts.
- No collectible stars appear anywhere.
- VAR hints/reactions do not reveal answers prematurely.

## M11 — Veoulla's Cottage, Mailbox, and Marcelino

**Goal:** Build the daily home hub and message archive.

**Build**

- Living room + reading/memory corner; no bedroom.
- Mailbox, multi-item delivery, unread/read/archive.
- Independent random initial message language and ribbon translation.
- Text/images/cards/gifts/keys/voice notes; no mailbox songs.
- Sheet-driven reusable countdown with days/hours/minutes/seconds and framed completed memory.
- Decoration slots and window time/weather/memory states.
- Marcelino first appearance from garden, mailbag, first Ahmed message, run-away behavior.
- VAR and Marcelino dedicated places.

**Acceptance**

- Multiple same-day messages deliver and archive independently.
- First message comes from Ahmed's active Sheet group and supports five-language voice/captions.
- Translation does not overwrite original/initial locale.
- Missed delivery retries next visit.
- Countdown target change in Sheets requires no rebuild.
- No song row can render as a mailbox item.

## M12 — Sunberry Fields

**Goal:** Implement multi-day, weather-reactive farming.

**Build**

- Sunflower, mango, and blueberry crops.
- Plant/water/grow/wilt/recover/harvest state machine from crop rows.
- Real-rain watering with failure fallback.
- Separate seeds/produce inventory.
- Café drink and Cottage decoration consumption hooks.
- Sunflower-key rules and achievements.
- Marcelino scheduled Cottage/Farm appearances.

**Acceptance**

- Growth uses authoritative time and survives devices.
- Missed watering wilts/stops but never permanently kills a crop.
- Eligible real rain updates watering once, idempotently.
- Harvest quantities and inventory are Sheet-authoritative.
- Barn remains exterior until its Sheet unlock enables the later interior.

## M13 — The Everkeep

**Goal:** Build the elevated final destination and persistent memory museum.

**Build**

- Approach, final-road key/puzzle gate, and Central Hall.
- Central living progress map and mysterious artifact.
- Progressive wings for archive, comic PDF, achievements, photos/memories, important messages, gifts, and Church stories.
- Previous-site archive portal.
- Page-turn PDF reader using Ahmed's existing file.
- Achievement physical exhibits and unnamed secret empty slots.
- Veoulla-only personal-content enforcement.

**Acceptance**

- First visit opens Central Hall while configured wings remain locked.
- Museum entrance verifies required keys server-side.
- Existing comic displays without recreating its pages.
- Secret achievement slots reveal no title/description before unlock.
- Reaching the final gallery does not invent an ending/exit.

## M14 — Living Map and Free Exploration

**Goal:** Complete first journey and enable the permanent navigation loop.

**Build**

- Living high-angle map with Veoulla avatar states.
- Location locks shown as mist/vines.
- Map pullback/descent transitions and road travel.
- Map unavailable until final first-journey beat.
- At Map unlock, transactionally complete the journey and clear checkpoint.
- After completion, normal visits begin at Cottage.
- Force-first-journey Admin flag and replay/skip rules.

**Acceptance**

- Original first journey cannot be skipped.
- Map unlock changes Sheet completion from `0` to `1` and persists locally.
- Refresh after completion starts at Cottage.
- Setting force flag to `1` re-enables the story once; finishing resets it.
- Replay grants no duplicate keys/achievements/messages.

## M15 — VAR Hybrid AI

**Goal:** Add optional AI conversation without allowing it to control canonical story state.

**Build**

- Authored dialogue remains mandatory for story beats.
- Optional backend AI conversation uses Sheet-controlled prompt/personality/knowledge flags.
- Use the official Gemini API from a Google Cloud/AI Studio project owned by Ahmed's second Google Pro account.
- Treat the consumer Google AI Pro/Gemini subscription as separate from Gemini API access: deployment requires a valid Gemini API authorization key and sufficient API quota/billing.
- Read the selected Gemini model, temperature, limits, enabled state, account label, project reference, and prototype plaintext authorization value from approved Sheet configuration; use the authorization only on the backend.
- Build every Gemini request from approved world canon, VAR's locked personality/behavior rules, recent bounded conversation context, and relevant Sheet-stored memory summaries.
- Memory categories: places, achievements/keys, choices/favorites, important conversation summaries, and explicitly shared mood.
- World canon retrieval from approved Sheet rows.
- Safe limited general knowledge.
- Failure/offline fallback to authored responses.
- VAR initiated reactions for important events/discoveries/return after absence.

**Acceptance**

- AI cannot award keys, complete beats, change time, or invent Sheet records.
- VAR does not contradict locked world facts in defined canon tests.
- Turning AI flag off preserves the entire authored world.
- Conversation summaries write only to the approved character/memory structure.
- AI service key is read only by backend from the prototype secret row.
- Gemini web-app chat history is never treated as VAR memory; a new device/session reconstructs VAR context from Sheet state.
- Disabling, exhausting, or removing Gemini credentials falls back to authored dialogue without breaking story navigation.

## M16 — Birthday Event Engine

**Goal:** Implement approved phases B0–B10 and the unmissable personal story.

**Build**

- Server-authoritative event phase calculation using Africa/Cairo by default.
- Admin time/phase override.
- T−24h, T−6h, T−1h, T−10m, T−60s, T0, T+1h, T+6h, T+24h, T+72h states.
- Synchronized final countdown.
- Birthday reveal, VAR greeting, Marcelino/Ahmed message, celebration Map, all location moments, Everkeep memory.
- Queue birthday story until first journey finishes if necessary.
- Missed-midnight entry and replay without duplicate rewards.

**Acceptance**

- Automated clock tests cover every exact phase boundary.
- Admin can preview every phase without changing device clock.
- Being offline at midnight does not lose content.
- All five voice/caption languages work through the reveal.
- Completion and claimed rewards persist in Sheets.
- Post-72h permanent memories remain while temporary decor disappears.

## M17 — Admin Panel

**Goal:** Give Ahmed operational control without editing code.

**Build**

- Separate Admin route/session.
- Dashboard: current authoritative time, active event/phase, Sheet health, session count, last logs, pending sync.
- Controls for force-first-journey, force-birthday, forced phase, time override, active codes, feature flags, content enabled state.
- View/search entry logs including IP.
- Inspect player story, keys, achievements, messages, Farm, characters, scores, and exhibits.
- Safe row editing or deep link to the relevant Sheet tab.
- Cache refresh button.

**Acceptance**

- Every approved flag changes behavior without rebuilding.
- Admin cannot accidentally award a duplicate one-time reward.
- Log filtering by date/result/IP/session works.
- Sheet schema errors are visible with exact tab/column/row.
- Admin actions themselves are logged.

## M18 — Integration, Performance, Deployment, and Handover

**Goal:** Produce the first deployable end-to-end release.

**Build**

- Optimize images/video/audio, lazy loading, route bundles, and Sheet payloads.
- Add loading, retry, offline cache, error boundary, and recovery UX.
- Cross-browser/device pass.
- Firebase Hosting/functions deployment configuration.
- Backup/export runbook for Google Sheet and media.
- Admin operations runbook.
- Known-limitations and later-security-hardening list.

**Acceptance**

- Complete original first journey passes from a clean Veoulla state.
- Normal second visit begins at Cottage and supports free exploration.
- Birthday phases and replay pass with Admin override.
- No blocking console/network errors.
- Mobile memory/performance remains within an agreed tested budget.
- All Sheet writes and key invariants reconcile after the full test.
- Deployment URL, rollback instructions, and evidence package are delivered.

## 7. Standard Claude Prompt Wrapper

Use this wrapper for every milestone, replacing the milestone block only:

```text
You are implementing one controlled milestone of Veoulla's World.

Read completely before editing:
1. docs/Veoullas_World_Living_Bible.md
2. docs/sheet-tab-contracts.md
3. the current repository state and tests

Implement only milestone [MXX — NAME] from Claude_Code_Master_Build_Plan.md.
Do not implement later milestones or revive old prototype decisions.

Required behavior:
- Treat Google Sheets as authoritative for all editable content/configuration and all player progress/state.
- Access Sheets only through the backend typed gateway.
- Preserve five-language and RTL/LTR support even when this milestone uses placeholders.
- Add automated tests for decision logic and failure/retry behavior.
- Do not hard-code content, asset URLs, icons, rewards, dates, codes, voice-over text, or event timing that belongs in Sheets.
- Do not duplicate one-time rewards.
- Keep the app runnable at the end.

Before finishing:
1. run typecheck, lint, unit/integration tests, and the milestone acceptance path;
2. inspect browser console/network errors;
3. provide desktop and mobile screenshots where UI changed;
4. show the exact Sheet rows read/written using sanitized evidence;
5. list changed files, commands run, acceptance results, and known limitations.

Stop and report any conflict with the Living Bible instead of guessing.
```

## 8. Acceptance Test Matrix

| ID | Area | Test | Expected result | Evidence |
| --- | --- | --- | --- | --- |
| T001 | Bootstrap | Sheet available | Config, five languages, icons/assets, story/event versions load | API response + screen |
| T002 | Bootstrap | Sheet unavailable | Cached safe experience or recoverable error; no blank page | offline capture |
| T003 | Access | Wrong Gate code | Subtle shake/sound, failed IP log, no code leak | video + log row |
| T004 | Access | Correct Gate code | Session created, success log/IP, Gate opens | video + session/log rows |
| T005 | Admin | Admin login | Separate Admin session and log | screen + rows |
| T006 | Sessions | Refresh valid session | Resumes without Gate re-entry | video |
| T007 | Localization | Switch five locales | Correct localized row selected | five screenshots |
| T008 | Direction | Arabic | RTL text/captions and deliberate icon mirroring | screenshot |
| T009 | Direction | EN/IT/EL/FR | LTR remains intact | screenshots |
| T010 | Voice | Audio available | Correct language audio + synchronized caption | recording |
| T011 | Voice | Audio missing/blocked | Caption remains and story continues | recording |
| T012 | Assets | Change icon URL | New icon appears after refresh/cache bypass | before/after |
| T013 | Story | First clean launch | Non-skippable route follows all 18 beats | full recording |
| T014 | Story | Close mid-route | Continue/Restart offered; Continue uses last checkpoint | recording + row |
| T015 | Story | Map unlock | Progress `0→1`, Map enabled, checkpoint cleared | Sheet diff |
| T016 | Story | Second visit | Starts at Cottage with free exploration | recording |
| T017 | Story | Forced replay | Flag enables one replay and resets afterward | flag/state rows |
| T018 | Keys | Award once | Found/available increment once | Sheet diff |
| T019 | Keys | Duplicate transaction | Quantity unchanged; original result returned | API test |
| T020 | Keys | Daily same-shape cap | Second award rejected on same authoritative day | API test |
| T021 | Map | Locked destination | Mist/vines and no invalid travel | screenshot |
| T022 | Movement | Desktop input | Keyboard/mouse/click path all work | recording |
| T023 | Movement | Mobile input | Drag/swipe/tap path works without blank bounds | recording |
| T024 | Church | Enter with music | Walkman stops completely | audio recording |
| T025 | Church | Quiz replay | Explanation/reference works; no duplicate reward | rows + recording |
| T026 | Café | Select song | Song starts by interaction and persists outside | recording |
| T027 | Arcade | Active game | Walkman lowers; only game SFX; score persists | recording + rows |
| T028 | Cottage | Multiple messages | Independent delivery/read/archive/translation | recording + rows |
| T029 | Cottage | Random initial locales | Messages can arrive in different languages; ribbon translates | rows + screenshots |
| T030 | Farm | Multi-day growth | Server-time stages persist across sessions | time test + rows |
| T031 | Farm | Missed watering | Wilts/stops, recovers, never dies permanently | rows + screenshots |
| T032 | Museum | Required key set | Server allows/denies correctly | API + recording |
| T033 | Museum | Secret exhibit locked | Empty position reveals no secret metadata | screenshot |
| T034 | VAR | Name/gender | Collar and state update everywhere | screenshots + row |
| T035 | VAR AI | AI disabled/fails | Authored world remains functional | test |
| T036 | Marcelino | Missed delivery | Retries on next visit | rows + recording |
| T037 | Birthday | Every boundary | Correct B0–B10 phase at exact offsets | automated tests |
| T038 | Birthday | Offline at midnight | Full unclaimed story appears next visit | recording + rows |
| T039 | Birthday | First journey incomplete | Birthday queues until Map unlock | end-to-end test |
| T040 | Birthday | Replay | No duplicate gifts/keys/achievements | Sheet diff |
| T041 | Admin | Simulate time/phase | World changes without device-clock change | recording |
| T042 | Logs | IP capture | Server IP recorded, client spoof field ignored | request/log evidence |
| T043 | Resilience | Write fails then retries | Pending queue reconciles exactly once | logs + rows |
| T044 | Security boundary | Frontend bundle scan | Google credential/private config absent | build scan |
| T045 | Full regression | Desktop + mobile complete loop | No blocking error; final Sheet invariants pass | evidence package |

## 9. Review Gate After Every Claude Delivery

ChatGPT should review in this order:

1. Scope: only the requested milestone changed.
2. Bible compliance: no old or invented behavior.
3. Data ownership: no forbidden hard-coded world data.
4. Sheet integrity: stable IDs, correct tabs, idempotent writes.
5. UX: desktop/mobile, first-person bounds, captions, RTL/LTR.
6. Reliability: checkpoint, retry, refresh, offline, duplicate prevention.
7. Evidence: commands, outputs, screenshots, Sheet diffs.
8. Decision: accept, accept with non-blocking notes, or reject with exact fixes.

## 10. First Instruction to Give Claude

Do not send all milestones as one build request. Start with **M00 only** using the Standard Claude Prompt Wrapper. After M00 evidence is reviewed and accepted, send M01.
