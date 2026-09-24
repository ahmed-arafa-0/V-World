# Release checklist

## Current release authorization — 2026-09-24

Ahmed authorized the ten manual-review fixes, a release commit, push and deployment to the existing
Render FREE service. The earlier deployment deferral below is historical for this release. Church
interior/candle-corner audio is removed entirely; the previous mute-control decision is superseded.
Desktop/portrait verification and the clean Node 22 production build pass. Ordinary review progress
is preserved. Render service identification/access is still unavailable, so no push or deployment has
been triggered. See [RELEASE_FIXES_2026-09-24.md](RELEASE_FIXES_2026-09-24.md).

2026-09-24 review continuation: the authorized birthday_2026 review and isolated ordinary journey
review are locally usable. Cairo dates are corrected to 21:00Z, the clock is scoped per review app
and synthetic player, real artwork/letters/gifts/replay are verified, and the final ordinary player
is unplayed at the black opening. See [M16_BIRTHDAY_REVIEW_EVIDENCE.md](M16_BIRTHDAY_REVIEW_EVIDENCE.md)
for commands, identities, backups, screenshots, current tests, and the remaining unrelated formatting
failures. This does not open M15, the rest of M17, or deployment.

Living checklist of what's actually ready vs. blocked for a real release, as of 2026-09-24. This
supplements, not replaces, `docs/plans/TECHNICAL_CLOSURE.md` (the Phase 3 technical-closure checklist)
and CLAUDE.md's own milestone gates. Nothing here overrides those.

## 2026-09-24: M16 opened, narrow M17 test-clock slice opened

Ahmed has supplied the previously-"Open" content inputs for M16 (target/end date, the approved
birthday letter + translations, the achievement, decoration record) and explicitly requested M16 —
Birthday Event Engine, plus a narrow admin-only/non-production test-clock and forced-phase/replay
slice of M17 scoped only to verifying the birthday event. See CLAUDE.md rule 18 for the exact scope
and constraints. This supersedes blocker rows #2 and #3 below for that narrow scope only; the general
M17 Admin Panel (feature-flags, active-codes UI, in-app Sheet editing) remains not built.

## Closed this pass (see `docs/reports/DIALOGUE_IMAGES_AUDIO_PREVIEW_EVIDENCE.md` for full evidence)

| Area                                                    | Status                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| First-journey dialogue (16 groups × 5 locales, 80 rows) | **Live** — all enabled, verified end-to-end through the real content-runtime API and a real rendered browser           |
| Story images (50 stories)                               | **Live** — all 50 discovered on Drive, registered, and linked; 0 missing filenames                                     |
| Church Gospel-reading mute control                      | **Live** — accessible, localized, persisted, positioned correctly after a bug found during live verification was fixed |
| Preview server state                                    | Both local preview servers (5050, 5051) rebuilt and restarted on the fixed code                                        |

## Remaining known blockers (verbatim carry-over from `docs/plans/TECHNICAL_CLOSURE.md` §1, unchanged by this pass)

| #   | Item                                                                      | Status        | Blocked on                                                                                                                         |
| --- | ------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | M15 — VAR Hybrid AI (Gemini)                                              | Not started   | Ahmed: a live Gemini API key, an approved prompt/personality/knowledge-flag row set. CLAUDE.md rule 8 forbids building this early. |
| 2   | M16 — Birthday Event Engine                                               | Not started   | Ahmed: target date, phase content, reward content — Living Bible §18I marks these "Open."                                          |
| 3   | M17 — Admin feature-flag/forced-phase/time-override/active-codes controls | Not built     | Meaningful only once M15/M16 exist to control                                                                                      |
| 4   | M17 — In-app Sheet row editing / deep link                                | Not built     | `apps/functions/src/config/resource-config.ts`'s own rule: the spreadsheet id must never be exposed over the API                   |
| 5   | M18 — Firebase Hosting/Functions deployment                               | Not attempted | No commit/push/deploy authorized in any pass to date                                                                               |

## New blocker identified this pass: no real deployment target configured

`.firebaserc` currently points at `demo-veoullas-world` — a placeholder project id, not a real
production Firebase project Ahmed owns. This means **there is nothing to `firebase deploy` to yet**,
independent of whether the code itself is deploy-ready. Before any real deployment:

1. Ahmed needs to supply (or create) a real Firebase project and update `.firebaserc`'s `default`
   project id.
2. `firebase.json`'s emulator config (`hosting: 5050`, `functions: 5001`) is local-only and doesn't
   need to change for a real deploy, but real Hosting/Functions deploy targets have never been
   exercised against a real project in this repository's history — that first real deploy should be
   treated as its own bounded, explicitly-authorized action, not assumed safe by extension from local
   preview success.
3. The Google Sheets/Drive service-account credential currently used locally (`config-private/google-service-account.json`)
   needs its production equivalent wired into Firebase Functions config/secrets before a real deploy
   would even boot — this is unchanged from every prior report and not re-litigated here.

## Content/media gaps still open (unchanged from earlier reports, not this task's scope)

Carried over from `docs/reports/MANUAL_JOURNEY/REPORT.md` and
`docs/reports/CONTENT_BANKS_V1_AND_CHURCH_AUDIO_EVIDENCE.md` — none of these block the technical
release path, each renders an honest empty/pending state:

- English/Italian/Greek/French translations for the 47 new stories and 300 verses (currently
  Arabic-only, by the content bank's own sourcing).
- The 50 undated celebration messages (no occasion dates exist yet to attach them to).
- The 16 `reserve_previous_16` quiz questions (intentionally reserved/unscheduled).
- Museum/exhibit text, Walkman song eligibility beyond the one new song, beach ambience audio, a
  portrait candle-corner asset.
- `beach_ocean_eye_level_loop`'s `10_ASSETS` row — still absent; Ahmed's own files are pending.

## What "release" actually requires next, in order

1. Ahmed's decision + content for M15 or M16 (whichever he wants next), **or** proceed with M17/M18
   technical work that doesn't require new content.
2. A real Firebase project id in `.firebaserc` and production credentials wired into Functions config.
3. An explicit, separate authorization to run `firebase deploy` for the first time — this checklist
   does not grant that authorization by itself.
