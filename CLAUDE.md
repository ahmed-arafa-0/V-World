# CLAUDE.md — Veoulla's World

Permanent project instruction file for Claude Code. Read this before touching any code.

## 1. Authority order

When sources conflict, resolve in this order and **stop and report the exact conflict** instead of guessing:

1. `docs/Veoullas_World_Living_Bible.md`
2. `docs/Claude_Code_Master_Build_Plan.md`
3. The current milestone prompt
4. Previously accepted code and tests

## 2. This is a new project

Never copy or revive behavior, code, or design decisions from an older Veoulla prototype unless the Living Bible explicitly approves it in its "Previous Ideas" review process.

## 3. One milestone at a time

Implement only the milestone you were asked to implement. Never start a future milestone (M02+) early, even partially, even as "preparation." If foundation work for a later milestone seems convenient now, don't — flag it instead.

## 4. Google Sheets is authoritative

Google Sheets is the single source of truth for: content, configuration, progress, keys, achievements, messages, character state, conversations, memories, events, sessions, and logs. Nothing in this list may be hard-coded or duplicated as a parallel source of truth in code.

## 5. Media: Google Drive only

Google Drive is the media source. **Firebase Storage is prohibited** — do not add it, even experimentally.

## 6. React never touches private credentials

React must never access the private Google Sheet or Google Drive credentials directly, and must never import anything from `apps/functions/config-private`.

## 7. Google credentials are backend-only

Google service account / Sheets / Drive credentials live only in server-side backend code and config, never in the frontend bundle.

## 8. Gemini is deferred to M15

No Gemini integration before M15. The Gemini API key must never be exposed to the frontend, ever, at any milestone.

## 9. Language support

Maintain support for English, Egyptian Arabic, Italian, Greek, and French. Arabic uses RTL; the other four use LTR. Don't build UI that assumes only English/LTR, even in placeholder milestones.

## 10. No hard-coded editable content

Never hard-code: text, assets, Drive file IDs, icons, dates, codes, event phases, rewards, dialogue, or story rules. These belong in Google Sheets and flow through the backend.

## 11. No collectible stars

The world uses **keys** only as its collectible/currency system. Never introduce stars.

## 12. Stable IDs and idempotent mutations

Preserve stable identifiers across changes. Any mutation that awards/spends/completes something must be idempotent (safe to retry without duplicating the effect).

## 13. Report conflicts, don't silently resolve them

If a prompt conflicts with the Living Bible or Master Build Plan, or a needed decision is missing/marked "Open," stop and report it explicitly rather than inventing an answer.

## 14. Preserve user files

Never delete or overwrite unrelated user files or in-progress work. Investigate before removing anything unfamiliar.

## 15. Before finishing every milestone, run

- formatting check
- lint
- typecheck
- unit tests
- integration tests
- build
- relevant Playwright tests

## 16. Every milestone produces an evidence report

Save it to `docs/reports/M<NN>_EVIDENCE.md`, containing: changed files, commands run, test results, screenshots, acceptance results, known limitations, and explicit confirmation that later milestones were not implemented.

## 17. No voice-over, anywhere (Ahmed's decision, 2026-09-17)

Voice-over is removed from the entire experience, across all three build phases. This supersedes every prior requirement for recorded narration, five-language voice-over, or Ahmed supplying recordings. Rules that follow from this:

- All dialogue/narrative text is still required in all five languages. VAR remains the sole first-journey narrator. Narration renders as cinematic text; direct dialogue renders as speech bubbles.
- Never add voice-over playback, voice-specific controls, audio requests, preload dependencies, or "voice unavailable/not configured" notices to the player experience.
- Story progression is player-paced text, not audio duration: a localized Continue action appears once text is fully shown; essential dialogue is never auto-dismissed before the player can read it.
- Background music, the Walkman, ambience, and sound effects are unaffected — including the Church/Café/Arcade audio rules — and keep the existing browser audio-enabling gesture for that remaining audio.
- Marcelino's mailbox voice-note feature (Ahmed's personal messages to Veoulla) is a distinct feature, unaffected by this rule.
- `16_VOICEOVER` and its historical rows, and `15_DIALOGUE.voiceover_id`'s historical values, stay in the Sheet untouched — no destructive schema migration. The backend simply no longer reads or exposes them.
- See `docs/Veoullas_World_Living_Bible.md` §3A-1 for the full decision record, and `docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md` for the implementation evidence.

## 18. M16 Birthday Event Engine opened, narrow M17 test-clock slice only (Ahmed's decision, 2026-09-24)

Ahmed has explicitly opened **M16 — Birthday Event Engine** as a currently-requested milestone, ahead of its position in the M04–M15 sequence, because the Living Bible §18K birthday timeline design was already **Locked — approved by Ahmed** and only its content inputs were marked "Open." Ahmed has now supplied those content inputs directly. This is a targeted exception to rule 3, not a general license to skip milestone order:

- In scope: `birthday_2026`'s date/time configuration fields and the Sheets-serial date-parsing fix in the existing normalization path; the approved birthday letter and its four translations; the `birthday_2026_celebrated` achievement; the decoration catalog/configuration record it uses; birthday-specific UI-text rows; the onboarding invitation-queue/late-arrival behavior described in Ahmed's request; and reset tooling for a dedicated review identity.
- Also in scope, narrowly: the specific slice of **M17** needed to test M16 — a **server-side, event-scoped, admin-only, non-production-route** injected test clock and forced-phase/replay controls for the birthday event only. This is not the general M17 Admin Panel milestone (feature-flag UI, active-codes controls, in-app Sheet editing) and does not open it.
- Still deferred: M15 (VAR/Gemini — birthday dialogue remains authored Sheets content, not AI-generated, per rule 8), the rest of M17 (production admin panel), and M18 (deployment). M04–M14 remain governed by whatever has actually been accepted for them regardless of this note.
- No real-owner reward mutation, no live global clock change, and no early/forced go-live of the event are authorized by this note — see Ahmed's request for the exact constraints.
- See `docs/reports/RELEASE_CHECKLIST.md` (updated same date) and the evidence report for this work once produced.

---

## Quick reference: repository shape

- `apps/web` — React + Vite + TypeScript frontend.
- `apps/functions` — Firebase Functions TypeScript backend (Express app behind one HTTPS function). Owns the Google Sheets gateway, schema-health service, bootstrap service, and backend-only secrets repository.
- `apps/functions/config-private` — server-only credentials (`google-service-account.json`); never committed, never imported by `apps/web`.
- `packages/contracts` — TypeScript types shared between frontend and backend (health, bootstrap, schema-health, API errors).
- `packages/sheet-schema` — the 42-tab registry: typed column definitions, normalization, relationships, and the 00_README dashboard parser.
- `packages/test-fixtures` — deterministic mock workbook fixtures (`GOOD_WORKBOOK`, `BROKEN_WORKBOOK`) used by unit tests; never real data.
- `docs/` — Living Bible, Master Build Plan, Sheets blueprint, evidence reports.
- `tests/e2e` — Playwright end-to-end tests (run against the real Sheet via the local emulator).
- `scripts/test-m01-live.mjs` — manually invoked live verification (`npm run test:m01:live`); never run as part of `npm run test`.

## Quick reference: current milestone

The formal M-numbered commit sequence (`M00`…`M03-B1`) is the last strictly-ordered milestone history in git log; substantial further work (Gate, island, buildings, characters, first journey, Church/Café/VARcade/Cottage/Farm/Everkeep, dialogue/images/audio) has since been built and evidenced under the `docs/reports/PHASE1`–`PHASE3` and related reports, tracked in `docs/reports/RELEASE_CHECKLIST.md` rather than by strict M-number. As of 2026-09-24, per rule 18, **M16 — Birthday Event Engine** and a narrow admin-only test-clock slice of M17 are explicitly opened and in progress; M15 (Gemini/VAR AI), the rest of M17 (production admin panel), and M18 (deployment) remain deferred. Consult `docs/reports/RELEASE_CHECKLIST.md` for the current authoritative status of each area before assuming a milestone is or isn't built.

## Release corrections authorized 2026-09-24

Ahmed explicitly authorized the reviewed application release to the existing Render FREE service, including commit/push/deploy; this supersedes the earlier deployment deferral for this release only. Church interior and candle corner are now completely silent: no hymns, Gospel playback, enable prompt, or reading mute controls. The exterior arrival bell remains. No paid service, billing change, Firebase deployment, real-owner reset, or production review clock is authorized. See `docs/reports/RELEASE_FIXES_2026-09-24.md`.
