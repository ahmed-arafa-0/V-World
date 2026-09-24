# Dedicated review candle repair — 22 September 2026

Implementation in the existing uncommitted working tree. No reset, new review identity, commit,
push, merge, deployment, content seeding, or owner gameplay writes. Claude was confirmed paused/finished.

## Identity and original failure

- The existing manifest identifies `manual_review_1790065059494`. Port 5051 was down when this repair
  began. Its preserved stderr records an unhandled `SHEET_UNAVAILABLE` read rejection terminating Node.
  That historical log contains neither a request identifier nor the original upstream HTTP status;
  it does **not** establish a quota error or identify which historical request crashed the process.
- Restarted only the dedicated review process with the same manifest and normal session authentication.
  Its `X-Review-Player` response header and authenticated session confirmed the specified player.
  Used an existing valid session privately in a separate automated browser context. No credentials or
  session tokens are included in evidence output. Ahmed's browser windows were not controlled or closed.
- Saved the player's affected state before reproduction to the gitignored
  `test-results/candle-review-repair/before-state.json`, alongside the original server error log,
  working-tree baseline patch, failure screenshot and sanitized network evidence.
- Reproduced **POST `/api/world/church/candle` → HTTP 500 `internal_error`, 7,102 ms**, request
  `review-71`. The correlated gateway log records a confirmed `37_CHARACTER_STATE` update, followed by
  `findFresh` throwing `TypeError: Cannot read properties of undefined (reading 'raw')`.
  The subsequent browser session read candle 3 as lit. This was a **successful candle mutation followed
  by a failed journey consistency update**, not proof that the candle save failed.

## Root cause and implementation

`scripts/review-isolation.mjs` treated `findFresh()` like `findByPrimaryKey()`. The former returns
`{ found, raw }`; the wrapper incorrectly accessed `result.row.raw`. The optimistic consistency path
in `mutateWorldDoc()` invokes this lookup when its snapshot is over 150 ms old. The error could occur
after the candle write while synchronizing the journey, before the first candle reward was recorded.
The wrapper also discarded the gateway's verified fresh-row arguments, causing redundant reads.

The wrapper now validates `result.found` and preserves the complete return shape and fresh-row
arguments. Foreign-player writes and attempts to change an existing row's owner remain rejected.
Normal Gate code validation, session expiry/termination checks, and owner/admin separation remain intact.

Session resume, heartbeat and logout handlers now catch storage failures and return sanitized HTTP
errors. Express 4 does not handle rejected asynchronous route promises automatically; these handlers
previously allowed a read/write rejection to terminate the preview. A storage failure preserves the
cookie for recovery, rather than pretending authentication became invalid.

Candle recovery now:

- Clears pending action state on success, error, rejection and timeout. Writes retain the existing
  30-second deadline; reconciliation makes one strict authoritative read with a 12-second deadline.
- Retains the exact light/extinguish/remove intent and Add operation ID, scoped to the player and
  persisted across reload. Conflicting candle actions remain disabled until recovery finishes.
- Reads the saved tray before resending an uncertain operation. Add receipts prevent a second candle
  from being created; a retry of Light remains Light even if the candle is already lit.
- Distinguishes an unknown save, a reconciled saved effect needing follow-up, and a confirmed save
  whose journey/HUD refresh failed. A refresh-only retry does not resend the candle mutation.
- Recovers a missed once-only candle reward from the persisted completed Church beat through the
  existing configured rule and idempotent reward ledger. Availability and caps still apply. Fault
  tests cover failure before the key write and after it but before the receipt, with one key after retry.

These changes use the existing Sheet state, without granting arbitrary keys, completing unmet steps,
changing configuration/content, or weakening the dedicated server's write isolation.

## Running build and persistence evidence

Rebuilt contracts, backend and web; restarted only `scripts/serve-fresh-review.mjs` on port 5051.
Final backend process at handoff: PID 4884. Safe request IDs and completion timings are logged locally.
The normal preview and unrelated browser windows were left alone.

Final ordinary candle clicks against the dedicated server and the same player:

| Endpoint                              | HTTP | Browser elapsed | Correlated server elapsed |
| ------------------------------------- | ---- | --------------- | ------------------------- |
| `/api/world/church/candle/extinguish` | 200  | 8,679 ms        | 1,581 ms                  |
| `/api/world/church/candle`            | 200  | 3,324 ms        | 3,242 ms                  |
| `/api/world/church/candle/add`        | 200  | 4,130 ms        | 1,709 ms                  |
| `/api/world/church/candle/remove`     | 200  | 1,767 ms        | 1,763 ms                  |

The browser duration includes waiting before the server handler starts. These measurements are not
attributed to Google quota or an internet outage. All four writes have correlated confirmation logs.

Leaving/re-entering the corner, reloading, and an independent `/api/world/church?fresh=1` read agree:
the original five IDs remain (`candle_1`–`candle_4`, `candle_a3`); candles 1, 2 and 3 are lit; the
temporary test additions are absent. The candle key quantity is **1**, unchanged by repeated
extinguish/light and Add/Remove cycles. The first repaired light paid the previously missing legitimate
key and reached the Café checkpoint. Ahmed subsequently continued to the Cottage during this work;
his later shell/music/token progress was preserved.

The last verification tab used the existing keyboard Back control to leave the Cottage's unrelated
delivery dialog, then ordinary navigation/candle clicks. That dialog's ineffective Close and missing
delivery content were not treated as the candle cause or changed in this repair. Reload still resumes
the player's current journey checkpoint; it does not reset the journey or force the Church location.

## Candle composition

Measured the actual desktop and portrait `church_candle_corner_scene` paintings. Replaced the oversized
viewport-clamped tray with raw painted-plane coordinates calibrated inside each sand trapezoid.
Perspective rows include the sprite foot width and a rim inset; alternating rows are staggered so
rear candles remain visible. Object-fit cover offsets/cropping and resize feed the same measured image
plane. The images themselves were not edited.

Actual review screenshots:

- [Desktop, five candles](../../test-results/candle-review-repair/corrected-desktop.png)
- [Portrait, five candles](../../test-results/candle-review-repair/corrected-portrait.png)
- [After reload](../../test-results/candle-review-repair/reload-desktop.png)

Isolated visual capacity checks with the actual paintings (no live player state changes):

- [Desktop maximum ten](../../test-results/candle-review-repair/layout-chromium-desktop-10.png)
- [Portrait maximum ten](../../test-results/candle-review-repair/layout-chromium-portrait-10.png)
- [Default six, portrait](../../test-results/candle-review-repair/layout-firefox-portrait-6.png)

The screenshot paths above are local gitignored artifacts; from this report's directory their
repository-relative location is `../../test-results`.

## Checks and limits

- **67 backend tests passed:** session errors/auth, world state, Church progression/rewards and routes.
- **19 web tests passed:** tray geometry, deadlines/pending state, reconciliation, persisted Add identity,
  and successful saves followed by failed refreshes. The recovery component tests were rerun after the
  final checking-state message adjustment.
- **12 browser layout cases passed:** five/default-six/maximum-ten, desktop 1440×900 and portrait
  390×844, Chromium and Firefox. Whole candle feet were asserted inside the sand polygon and viewport;
  corrected five- and ten-candle images were visually inspected.
- Dedicated review isolation script passed normal/wrong-code authentication, slow optimistic mutations,
  present/absent fresh lookups, and foreign-player/configuration write rejection.
- Lint, typecheck, build and frontend credential-boundary scan passed.
- Repository-wide format check still reports the same four pre-existing historical report files:
  `JOURNEY_POLISH/REPORT.md`, `PHASE2/ART_INTEGRATION/results-all.json`,
  `PHASE2/ART_PREP/art-prep-results.json`, `PHASE2/browser-results.json`. They were left untouched.
- Capacity/fault injection checks use isolated fixtures; live default/max tray state was not manufactured.
  No broad live-Sheet journey or full test-suite rerun was performed. Historical upstream error details
  cannot be reconstructed from the original uncorrelated crash log. Browser waits can still take several
  seconds, as the measured results show.

Ahmed can reload his existing **http://localhost:5051** tab to load the corrected client. The same
review player and its current progress remain in place.
