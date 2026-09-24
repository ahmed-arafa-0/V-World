# Cottage welcome message — 22 September 2026

Implemented the authorized live content update and delivery-dialog dismissal fix in the existing
working tree. No reset, direct live player-progress edits, manual rewards, commit, push or deployment.
Claude's earlier paused/finished confirmation remained in effect.

## Content update

The first-delivery lookup selects enabled `19_MESSAGES` groups addressed to the session user (or
public), with the `<FIRST_VISIT>` schedule and usable written text. The five intended rows existed,
but all contained explicit authoring placeholders. These exact placeholders were replaced; no authored
message conflicts were found. The missing-content error remains in place.

| Existing row ID  | Locale          | Changed field |
| ---------------- | --------------- | ------------- |
| `msg_welcome_en` | English         | `text`        |
| `msg_welcome_ar` | Egyptian Arabic | `text`        |
| `msg_welcome_it` | Italian         | `text`        |
| `msg_welcome_el` | Greek           | `text`        |
| `msg_welcome_fr` | French          | `text`        |

The Arabic is exactly Ahmed's approved text. The other four are faithful translations retaining the
six paragraphs, friendly tone, playful titles, heart symbols and signature. Authored source:
[welcome-message-2026-09-22.json](../../scripts/content/welcome-message-2026-09-22.json).

Every row retains `message_id=msg_welcome_ahmed`, `recipient_user_id=veoulla`, `sender_id=admin_ahmed`,
`delivery_at=<FIRST_VISIT>`, locale/direction, translation group, archive flag, voice/image/gift references,
notes and enabled status. No rows were appended. Formula-aware readback compared the whole message tab
and confirmed that only the five intended text cells changed (I2:I6 in the previewed sheet).

The manual seed uses the normal credential-backed backend `SheetGateway`, not the restricted review
gateway. It requires a local exact-row preview, refuses different authored text or a formula in a
target cell, checks row metadata before writes, and patches only `text`. Only the five known authoring
prompts (or blank text) are replaceable. This adds no production API or auth exception.

- `node scripts/seed-welcome-message.mjs --preview`: saved and inspected all exact before/after rows.
- `node scripts/seed-welcome-message.mjs --apply`: **5 changed**, formula/unrelated-field comparison passed.
- Identical `--apply` rerun: **0 changed, 5 unchanged**, no writes.

Local gitignored evidence: `test-results/welcome-message/content-preview.json`, `applied.json`,
`rerun.json`, and formula-preserving before/after snapshots.

## Recipient mapping and live review state

The existing dedicated review gateway maps owner-addressed content into
`manual_review_1790065059494`'s local view. It now sees all five written welcome locales. This mapping
was not broadened or changed. Other recipients stayed unchanged in the live read-only comparison;
an isolated browser test also proved another player's private message was neither delivered nor shown.

The live server's existing content cache expired naturally: the running process successfully served
the new content. No cache endpoint, auth bypass, or preview restart was added. The rebuilt frontend is
served on `http://localhost:5051` (`index-LdadNAO0.js` at verification); reload loads the Close fix.

At the start, Ahmed's player was at `beat_12_marcelino` with no delivered messages. While this task was
running, the **existing live browser session** submitted ordinary actions, recorded in the dedicated
server log:

| Request                              | Endpoint                              | HTTP |
| ------------------------------------ | ------------------------------------- | ---- |
| `review-261`                         | `/api/world/marcelino/first-delivery` | 200  |
| `review-265`                         | `/api/world/mailbox/open`             | 200  |
| `review-267` and subsequent requests | `/api/world/mailbox/translate`        | 200  |

Read-only verification found `msg_welcome_ahmed` archived, initial locale `fr`, current translation
`ar-EG`, delivered at 13:38:07 UTC and opened at 13:38:16 UTC. The player subsequently continued;
the last checkpoint read was `beat_16_hall`. **That newer state was preserved**, not moved back to
Try again. This task issued no delivery, reading, reward or checkpoint mutations for the live review
player. Browser verification used the isolated in-memory player `manual_review_112233445566` only.

## Close/Escape fix and verification

Reproduced the old ineffective Close in a browser before rebuilding: both delivery panels had no-op
close handlers. `Exterior.tsx` now dismisses those panels through local state. Close/Escape send no
mutation and do not mark a message read or complete a story step. The mailbox explicitly reopens the
pending dialog, preserving its current phase and retry error. Effects and an already-requested
delivery's later response do not reopen a dismissed dialog automatically.

Checks passed:

- **66 backend tests**: welcome seed/conflicts/formulas/idempotency, gateway behavior, existing world
  locations and recovery regressions.
- **6 UI tests**: Close and Escape on both dialogs, no immediate reopen or mutation, closing during
  an already-authorized delivery, and honest missing-content feedback.
- **Isolated browser flow**: Close/Escape/reopen; missing content returns 409 without delivery or
  progress; retry with approved text delivers unread and reaches `beat_13_message`; closing the
  mailbox leaves it unread; only clicking Open archives it and advances to `beat_14_farm`.
  All five displayed texts exactly match the authored strings, including paragraph breaks. Translation
  leaves the initial locale unchanged. One configured letter key is awarded; foreign mail is excluded.
- Backend and frontend builds, typecheck, lint and frontend credential-boundary scan passed.
- Repository-wide formatting still flags the same four pre-existing historical report files:
  `JOURNEY_POLISH/REPORT.md`, `PHASE2/ART_INTEGRATION/results-all.json`,
  `PHASE2/ART_PREP/art-prep-results.json`, and `PHASE2/browser-results.json`; left untouched.

Screenshots: [Arabic](../../test-results/welcome-message/message-ar-EG.png),
[English](../../test-results/welcome-message/message-en.png),
[Italian](../../test-results/welcome-message/message-it.png),
[Greek](../../test-results/welcome-message/message-el.png),
[French](../../test-results/welcome-message/message-fr.png).

No unrelated content, assets, credentials, schedules, owner progress or browser windows were changed.
