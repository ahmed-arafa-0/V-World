# Birthday and fresh ordinary review — 2026-09-24

The authorized birthday review continuation is usable locally. Both dedicated Firefox windows are open. No commit, staging, push, merge, deployment, billing change, broad content seed, or global clock override was performed. The real owner, other players, shared content, credentials, and unrelated working-tree changes were preserved.

| Review           | URL                   | Dedicated player                   | Handoff state                                                                                                                               |
| ---------------- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary journey | http://localhost:5051 | `manual_review_1790231770385`      | Unplayed black opening; zero gameplay/reward rows; no authenticated session in its fresh profile                                            |
| Birthday         | http://127.0.0.1:5052 | `manual_review_bday_1790235809922` | Live birthday window; actual approved letter available; completed with gifts claimed and two replays, preserved after the window was opened |

Run commands from `C:\Users\AR\Desktop\V-World`. The servers are already running. To reopen a closed review window:

```powershell
node scripts/open-fresh-review.mjs
node scripts/birthday-preview.mjs open
```

If a server has stopped, start its corresponding command instead:

```powershell
node scripts/serve-fresh-review.mjs --open
node scripts/birthday-preview.mjs serve --open
```

Close the **birthday review window only** before each command using `--open`; its persistent profile permits one browser instance. Leave the ordinary review window open. These commands affect only the manifest-selected birthday player:

```powershell
node scripts/birthday-preview.mjs scenario before --open
node scripts/birthday-preview.mjs scenario final20 --fresh --open
node scripts/birthday-preview.mjs scenario live --fresh --open
node scripts/birthday-preview.mjs scenario late-arrival --fresh --open
node scripts/birthday-preview.mjs scenario replay --open
node scripts/birthday-preview.mjs scenario countdown-only --open
node scripts/birthday-preview.mjs scenario clear
```

`--fresh` backs up and resets only this dedicated birthday player's gameplay/reward records, then restores the existing review setup with naming/journey completed so birthday and Cottage interactions are immediately reachable. It never resets the ordinary review player. Omit `--fresh` to retain birthday completion and gifts. Replay scenarios ensure this synthetic player has completed once, then open the requested replay. `final20 --open` loads the world before starting the running event clock and enters the countdown automatically. `clear` restores birthday real time; close the overlay/reload to see the ordinary before-event screen. Restarting the birthday server also clears the in-memory clock.

The ordinary review uses normal Gate validation. The in-memory local gateway maps the successful Gate login to its selected synthetic identity and rejects imported owner sessions/foreign writes. The final manifest was missing when work began. The latest actual `manual-review` session identified `manual_review_1790231770385`, matching the post-doors player described in the request. Its single `cove_arrival` progress row was backed up and cleared. All ten gameplay/state tables were checked; reward receipts live within those tables. Historical audit logs remain untouched. The dedicated browser profile was cleared without accessing Ahmed's main profile.

- Ordinary manifest: `test-results/review-repair/fresh-review.json`.
- Ordinary backup: [manual_review_1790231770385-1790234944691.json](../../test-results/review-backups/manual_review_1790231770385-1790234944691.json).
- Ordinary opening screenshot: [fresh-black-opening.png](../../test-results/review-repair/fresh-black-opening.png).
- Browser profiles: `test-results/review-repair/browser-profile` and `test-results/birthday-review/browser-profile`.
- Birthday manifest: `test-results/birthday-review/manifest.json`; contains private test authentication material and must not be printed or shared.
- Latest handoff status: [handoff-state.json](../../test-results/birthday-review/handoff-state.json).

The birthday override is now an instance owned by one app and one explicitly configured synthetic birthday identity. A shared preview, ordinary review, unconfigured app, staging, and production cannot enable the clock route. The dedicated route still requires the existing admin session authentication. Ordinary routes, sessions/expiry, journey timestamps, Farm/crops, rewards, and message schedules use the real clock. The dedicated birthday gateway reads the actual owner-addressed `msg_birthday_2026` locale rows through a local in-memory recipient mapping only. The live recipients and production recipient checks remain unchanged; a direct unscoped read for the same synthetic player cannot resolve the private letter. No general admin panel was added.

The old shared preview process PID 12624 was identified by its command line and restarted to remove its process-wide override and load the corrected code. Handoff server PIDs were 37340 (shared real-time preview, 5050), 39376 (ordinary, 5051), and 12520 (birthday, 5052). No blanket Node/browser termination was used. A completed disposable QA helper that stayed alive after saving its successful result was stopped by its own verified PID. Ahmed's existing browser windows were left alone.

The event's dates were converted using `Intl.DateTimeFormat` with IANA `Africa/Cairo`, then round-tripped to local wall times before asserting the required UTC values. September 2026 uses UTC+3:

| Live cell      | Field       | Cairo local      | UTC                        |
| -------------- | ----------- | ---------------- | -------------------------- |
| `17_EVENTS!D2` | `target_at` | 2026-09-26 00:00 | `2026-09-25T21:00:00.000Z` |
| `17_EVENTS!F2` | `start_at`  | 2026-09-26 00:00 | `2026-09-25T21:00:00.000Z` |
| `17_EVENTS!G2` | `end_at`    | 2026-09-28 00:00 | `2026-09-27T21:00:00.000Z` |

Those three cells changed from 22:00Z to 21:00Z. The full original birthday row, headers, formulas, planned patch and coordinates were saved before writing: [birthday_2026-1790234787672.json](../../test-results/birthday-review/date-backups/birthday_2026-1790234787672.json). Fresh normalized readback passed. A full `17_EVENTS` formula-view comparison proved all other cells and formulas unchanged. The final seed command has a date-only path; its apply rerun reported **zero cells changed**:

```powershell
node scripts/seed-birthday-event-content.mjs --event-dates-only --apply
node scripts/verify-birthday-window-live.mjs
```

Boundary assertions passed at T−20.001s, T−20s, T−1ms, T, end−1ms, and end. The normalized Sheet-date/serial-number regression remains covered. The ordinary Cottage countdown resolves exactly the same corrected target while retaining real server time. No live message schedule or other event was changed.

The existing implementation was repaired in these areas:

- Scoped the birthday clock per app/player and disabled it by default.
- Stopped automatic invitations after the event; retained manual first-time celebration and replay.
- Deferred invitations for scene-local dialogs as well as Church, active games, and world overlays.
- Refreshed birthday state after acceptance so the live countdown uses the current server response.
- Moved the birthday modal above global language/settings controls, preserving Arabic direction.
- Grounded all three candle bodies on the cake; full replay relights them locally without overwriting the saved first celebration.
- Refreshed the Cottage decoration picker when opened after a gift claim, and rendered the registered owned decoration artwork in its placed slot.
- Replaced cookie-printing review commands with dedicated-profile launchers; retired five still-valid previously printed synthetic sessions. Owner sessions were not retired.

Claude's `bynjgv2bf` run had exited successfully before this continuation. Its existing desktop/mobile captures established prior art progress and decoration API persistence, but used the old date and a pending letter. Those limitations were not treated as proof. The new strict browser checks require every rendered image to load with positive natural dimensions and decode before screenshots; image errors are not swallowed.

| Actual rendered evidence             | Desktop, English                                                                                                                                                             | Portrait 390×844, Arabic RTL                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garden + existing cat/Marcelino      | [garden](../../test-results/birthday-review/verified/desktop/2-garden.png)                                                                                                   | [portrait garden](../../test-results/birthday-review/verified/portrait/2-garden.png)                                                                                               |
| Cake and three lit candles           | [cake](../../test-results/birthday-review/verified/desktop/3-cake-lit.png)                                                                                                   | [cake](../../test-results/birthday-review/verified/portrait/3-cake-lit.png)                                                                                                        |
| Three bodies, zero flames            | [extinguished](../../test-results/birthday-review/verified/desktop/4-three-unlit-candles.png)                                                                                | [extinguished](../../test-results/birthday-review/verified/portrait/4-three-unlit-candles.png)                                                                                     |
| Actual approved birthday letter      | [letter](../../test-results/birthday-review/verified/desktop/5-actual-letter.png), [ending](../../test-results/birthday-review/verified/desktop/5b-actual-letter-ending.png) | [RTL letter](../../test-results/birthday-review/verified/portrait/5-actual-letter.png), [ending](../../test-results/birthday-review/verified/portrait/5b-actual-letter-ending.png) |
| Gifts and catalog achievement icon   | [gifts](../../test-results/birthday-review/verified/desktop/6-gifts-real-icon.png)                                                                                           | [gifts](../../test-results/birthday-review/verified/portrait/6-gifts-real-icon.png)                                                                                                |
| Real decoration placed, after reload | [Cottage](../../test-results/birthday-review/verified/desktop/7-decoration-after-reload.png)                                                                                 | [Cottage](../../test-results/birthday-review/verified/portrait/7-decoration-after-reload.png)                                                                                      |
| Countdown-only replay                | [countdown](../../test-results/birthday-review/verified/desktop/8-countdown-only-replay.png)                                                                                 | [countdown](../../test-results/birthday-review/verified/portrait/8-countdown-only-replay.png)                                                                                      |

The strict full-flow run used `manual_review_bday_art_desktop_1790235667118` and `manual_review_bday_art_portrait_1790235769407`. Presentation follow-up reused these completed QA players to capture the final portal/placed-art fixes; no gift reset or duplicate claim was needed. All five approved birthday-letter locale texts were compared exactly in memory with the live source rows; the text itself was not logged. English and Arabic were rendered in the app. The approved birthday letter and the unrelated Cottage welcome letter were not rewritten.

The live flow confirmed one birthday achievement, one owned decoration, and one birthday message receipt through retries/reloads/replay; no additional keys. Decoration placement was made through the visible Cottage picker and verified after reload, including the decoded registered artwork. Full celebration replay works; countdown-only replay reaches zero with **zero birthday POST requests**, unchanged birthday stage/rewards, and unchanged ordinary progress/keys. The desktop countdown crossed the real flowing simulated boundary into `live`. Portrait first arrival after the end stayed quiet until its manual birthday entry was selected.

Separate disposable live browser contexts exercised black opening → wrong Gate rejection → correct Gate → synthetic session → doors → empty naming → world. The birthday version showed no invitation during onboarding and invited at the first eligible world screen. The final ordinary review identity was not used for QA. Results: [verified-opening.json](../../test-results/review-repair/verified-opening.json). Another fresh synthetic player verified actual Church and active Arcade deferral and invitation immediately after closing the game: [deferral.json](../../test-results/birthday-review/deferral.json). The Cottage's own decoration dialog also deferred the invitation in the real-art run.

| Check                                    | Result                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Focused backend birthday/clock APIs      | 38 passed                                                                                                |
| Focused birthday and Cottage views       | 16 passed                                                                                                |
| Full current suite                       | **46 schema + 684 backend + 433 web = 1,163 passed**                                                     |
| Web suite after final presentation fixes | **433 passed**                                                                                           |
| Typecheck                                | Passed                                                                                                   |
| Final complete build                     | Passed                                                                                                   |
| Repository lint                          | Passed                                                                                                   |
| Formatting of touched files              | Passed                                                                                                   |
| Repository-wide formatting               | 60 unrelated pre-existing files remain; left unchanged                                                   |
| `verify-review-isolation.mjs`            | Passed normal Gate validation, scoped writes, owner/config/asset rejection, and fresh lookup consistency |
| `verify-fresh-review-live.mjs`           | Passed ordinary and birthday onboarding, final player still empty                                        |
| `verify-birthday-real-art.mjs`           | Passed desktop/portrait flow, exact letters, decoded images, gifts, placement, replay                    |
| `verify-birthday-presentation.mjs`       | Passed final placed artwork, modal stacking, letter top/ending screenshots using existing QA players     |
| `verify-birthday-deferral-live.mjs`      | Passed rendered Church and active Arcade deferral                                                        |

Logs, JSON results, profiles and images are under `test-results/birthday-review/` and `test-results/review-repair/`. The touched-file inventory is `test-results/birthday-review/touched-files.json`. The full-suite evidence is `full-tests.log`; final frontend regression evidence is `final-web-tests.log`; final build/typecheck/lint logs are adjacent. The prior total of 1,157 was historical evidence, not substituted for this run. The lower backend count reflects consolidation of five clock tests into two broader isolation tests plus two additional API tests; coverage includes other players, separate apps, disabled/default configuration, production, flowing time, and clearing.

Immediate manual checklist:

1. In the ordinary window, choose a language and Continue through the black opening, enter the normal Gate code, watch the doors, and name the companion. Play the full journey normally.
2. In the separate birthday window, celebrate, extinguish the three flames, skip/write a wish, read the letter, claim gifts, close, and place the sunflower decoration in a Cottage slot. Reload to check it remains.
3. Use the birthday entry menu for `نحتفل تاني` and `أعيدي آخر ٢٠ ثانية`. Use the commands above for an untouched late arrival or a running final countdown. The ordinary window/player stays independent.

No task-blocking limitation remains for these two local reviews. These are local review tools requiring the existing backend credentials and network access to Sheets/Drive. The broader M15, general M17 admin panel, and M18 deployment remain deferred; this review pass does not claim production deployment or formal acceptance of those milestones.
