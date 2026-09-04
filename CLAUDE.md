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

Never hard-code: text, assets, Drive file IDs, icons, dates, codes, event phases, rewards, voice-over, dialogue, or story rules. These belong in Google Sheets and flow through the backend.

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

**M01 — Google Sheets Gateway and Schema Health** is the latest accepted milestone. See `docs/reports/M01_EVIDENCE.md` (and `docs/reports/M00_EVIDENCE.md` for the foundation). Do not build the Gate, island, Map, buildings, characters, birthday event, VAR/Gemini, Marcelino, sessions/IP logging, player progress writes, or real Admin authentication until their milestone is explicitly requested and M01 has been accepted. The Admin Schema Health route is intentionally unauthenticated and read-only pending M02.
