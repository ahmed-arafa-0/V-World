# Phase 2 Progress Log (M08–M14)

Resumable checkpoint log. Scope/attribution: `docs/plans/THREE_PHASE_DELIVERY.md`. Phase 1 log: `docs/plans/PHASE_1_PROGRESS.md`. Evidence: `docs/reports/PHASE_2_EVIDENCE.md`. Missing art/content: `docs/assets/PHASE_2_HANDOFF.md`.
No commit / push / merge / deploy is authorized. Never modify the real owner's (`veoulla`) rows for testing — use isolated generated users or the in-memory fixture (`scripts/lib/phase2-fixture.mjs`).

## How to resume

1. Read `CLAUDE.md`, this file, the handoff, and the evidence report.
2. `git status` — the tree intentionally holds all Phase 1 + Phase 2 work uncommitted.
3. Phase 2 is **complete at its boundary**. The next authorized phase is Phase 3 (M15–M18); nothing from it has been started.

## Status

| Item                                                                                                         | Status                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 0. Icon visual check + fix (`scripts/verify-icons-visual.mjs`)                                               | Done                                 |
| Shared world engine (contracts, state docs, rule-based rewards, journey)                                     | Done                                 |
| M08 Church                                                                                                   | Done                                 |
| M09 Vinyl Café + Walkman                                                                                     | Done                                 |
| M10 VARcade (memory, catching, picture puzzle)                                                               | Done                                 |
| M11 Cottage / Mailbox / Marcelino                                                                            | Done                                 |
| M12 Sunberry Fields                                                                                          | Done                                 |
| M13 The Everkeep                                                                                             | Done                                 |
| M14 Living Map + first-journey completion / replay                                                           | Done                                 |
| Config seed (725 labels + 2 log event types) run once on the live Sheet                                      | Done                                 |
| Gates: format, lint, typecheck, 826 tests, build, security scan, Playwright, 92/92 real-browser journey      | Done                                 |
| Consolidated handoff + evidence                                                                              | Done                                 |
| Closure pass: reward lockdown, Playwright reconciliation, ambience, Marcelino default, typed/versioned state | Done (PHASE_2_EVIDENCE.md section 7) |

## Design decisions (no schema migration, no new tabs)

- Per-user location state = JSON in `37_CHARACTER_STATE.story_flags_json` on rows `<userId>|world_<system>` (**awaiting Ahmed's confirmation**).
- Keys only from `22_KEY_RULES` via `claimRuleReward` (once per rule per user; replay-safe). Beats/interactions come from `14_STORY_BEATS`; Phase-1 `first_opening` implies beats 01–06.
- Song requests append to `05_ENTRY_LOGS` (`song_request`).
- Content that is blank, `<PLACEHOLDER>`, disabled, or (Church) not `approved` is treated as absent.

## Known follow-ups for Phase 3 / Ahmed

See `docs/assets/PHASE_2_HANDOFF.md` §1–§5 and `docs/reports/PHASE_2_EVIDENCE.md` §5 (art, audio ambience, personal content, Open decisions, legacy key-award endpoint hardening).

## Art-integration preparation (2026-09-20)

No Phase 2 artwork exists on disk yet (only `assets/phase1`). Prepared without it: plane-based responsive composition (`apps/web/src/features/world/placeComposition.ts`, `Stage` serves the portrait variant on portrait screens), separate `MarcelinoSprite` (`marcelino_<pose>` ids, emoji stand-in until registered), Cottage anchors for the cat home / chick home / countdown / mailbox, junction verification before and after Church completion (`npm run verify:phase2:art-prep`, SAMPLE composition guides only in the in-memory fixture). Exact remaining art: `docs/assets/PHASE_2_ART_REQUIREMENTS.md`.
