# Review progression, Cottage countdown, and fresh entry

Date: 2026-09-22. Implementation in the existing working tree. No commit, push, merge, deployment, content/configuration cleanup, or owner-progress mutation.

## Identity and original evidence

Read `CLAUDE.md`, the applicable Living Bible and Master Build Plan sections, `PHASE3_TECHNICAL_CLOSURE_EVIDENCE.md`, and the review-corrections handoff. Ahmed confirmed Claude was paused/finished before implementation. Existing tracked and untracked work was retained; the initial tracked diff and original versions of edited files are in gitignored `test-results/review-repair/`.

The old headed review process names `manual_review_1789978838970`; its journey was already complete. Its latest used session had expired. More recent interactive session metadata identifies `veoulla`, whose read-only journey state was at `beat_15_museum_approach` / `museum_key_check`. Since this is the real owner, it was never reset or played through. Desktop attachment was unavailable (the native helper pipe was absent, and browser inventory was empty), so the active tab could not be independently identified. The requested screenshot was not present in the conversation. These are limitations: the reproduction below is on an isolated in-memory copy of the saved owner state, not an interaction with Ahmed's existing browser.

Evidence saved **before any player preparation**:

- `test-results/review-repair/original-review-state.json`: recovery snapshot of the known older review player's gameplay, naming, keys, achievements, messages, Farm, scores, exhibits and character state.
- `blocked-owner-clone-source.json`, `owner-journey-readonly.json`, `blocked-museum-readonly.json`: bounded read-only state used to reproduce the other, currently incomplete journey. No session cookies, authentication secrets or private credentials are included.
- `original-museum-block.png` and `original-museum-network.json`: ordinary browser click on the Museum gate, the GET responses, token `0/1`, and disabled puzzle/Open Door controls. The saved-state clone uses the real backend and original paintings over an in-memory workbook.

## Progression failure and repair

The observed blocker is a **missing Arcade token reward**, not an achievement requirement. The Museum rule requires the six location keys. Five were present, but the token had `quantity_found=0`, `quantity_spent=0`, `quantity_available=0`. The Arcade document already had `introWon=true`, and saved memory-game wins scored 65, 65 and 80 (including a later retry). The configured minimum is 1. The Arcade journey beat had already been recorded complete, but `rule_first_token` was absent from the reward ledger.

`syncJourney` writes completed beats before claiming their rewards and only claims rewards for newly completed beats. If the key write fails after the beat write, later syncs and new wins skip that reward indefinitely. A fault-injection regression reproduces exactly that ordering. The historical cause of this particular incomplete write cannot be established from the retained rows alone; the persistent inconsistency and failure of retry recovery are established.

Implemented `recoverArcadeIntroReward` and the authenticated `POST /api/world/arcade/recover-intro-reward` action. Recovery checks the Sheet's enabled journey beat and referenced reward rule, the installed introductory cabinet, the persisted win flag, and actual saved qualifying scores. It then uses the existing `claimRuleReward` path, including availability, daily key limits and the one-time claim ledger. Historical wins cannot generate recurring daily rewards. A client cannot choose a player, quantity, achievement or reward identifier. No journey step is acknowledged or marked complete by recovery.

Normal Arcade attempt retries also reconcile the missed reward. At the Museum, **Check saved Arcade win** explains the missing-key condition and retries the earned reward explicitly. Missing wins, unavailable rewards, failed requests, loading failures and unsolved puzzles remain distinct; a failed verification no longer falsely reports every error as missing keys. The configured Museum key requirements are unchanged.

Browser verification on the isolated saved-state copy: gate click → simulated recovery request failure with visible feedback and controls still locked → retry saved-win check → token available → seat all six keys → solve → Open Door → **Museum Hall reachable**. No forced click or direct mutation was used for this verification. Screenshot: `test-results/review-repair/repaired-museum-hall.png`; request/response evidence: `repaired-museum-network.json`.

Also removed the existing missing-message bypass. A first-visit message with no usable text now returns `WORLD_CONTENT_UNAVAILABLE`, keeps delivery/read progression incomplete, and displays five-language guidance plus Retry. The pending-content flag is no longer proof that the first message was read. No personal message was invented or added to Sheets. This intentionally supersedes the prior test that expected absent content to silently complete two steps, in accordance with Ahmed's current instruction.

## Cottage countdown

Each of days/hours/minutes/seconds now has its own measured rectangle on the desktop and portrait image planes. Unlike reachable navigation controls, these text rectangles are not independently clamped when the painting crops. Resize follows the same cover-fit plane as the actual image. Numbers are centered, sized by their own compartment and digit count, use tabular numerals, and remain live text driven by the existing server-time offset and authoritative target. The slight painted slope is matched with a restrained skew.

Each localized unit label is measured using its rendered glyph width (including Arabic shaping) and fitted **inside** its compartment. The full readable countdown panel remains keyboard/tap accessible. The Cottage landscape crop keeps the mantel below the language HUD. Compact shelf controls avoid caption/target collisions introduced by that crop; other scenes were not redesigned.

Final screenshots:

- [Desktop, Firefox 100%](../../test-results/review-repair/countdown-firefox-desktop-1-en.png)
- [Desktop, Firefox 90%](../../test-results/review-repair/countdown-firefox-desktop-0.9-en.png)
- [Portrait mobile, Firefox 100%](../../test-results/review-repair/countdown-firefox-portrait-1-en.png)
- [Portrait mobile, Firefox 90%](../../test-results/review-repair/countdown-firefox-portrait-0.9-en.png)
- [Landscape mobile, Firefox 100%](../../test-results/review-repair/countdown-firefox-landscape-1-en.png)
- [Landscape mobile, Firefox 90%, Arabic](../../test-results/review-repair/countdown-firefox-landscape-0.9-ar-EG.png)

`verify-review-countdown.mjs` passes 60 combinations: Chromium and Firefox × desktop/portrait/landscape × 100%/90% × five locales. Labels fit their individual fields and the live panel opens. Firefox uses its **native per-site full zoom** in disposable profiles; measured device pixel ratio is approximately 0.8955 at 90%, and 1 at 100%. Chromium's 90% cases use the equivalent CSS viewport, not native browser chrome zoom. At native Firefox zoom, the layout test uses ordinary keyboard activation because Playwright's pointer coordinate translation does not correctly account for native full zoom. Screenshots were visually inspected at the final layout, including the nearby landscape shelf controls. Portrait compartment labels are necessarily small; the full countdown panel supplies the larger reading view.

## Fresh review handoff

Created a **new isolated player**, `manual_review_1790065059494`, instead of resetting either the completed older test player or the possibly active real owner. Its manifest and empty recovery snapshot are `test-results/review-repair/fresh-review.json`. All ten gameplay/state tables contain zero rows for that identity; there is no name, checkpoint, key/reward history, achievement, location, score or character state to resume.

The dedicated local server runs at **http://localhost:5051**. Its separate Firefox window is open at the actual black opening, with Continue visible. No clicks, Gate entry, naming or gameplay were performed on this final player. [Opening evidence](../../test-results/review-repair/fresh-black-opening.png).

Ahmed should use that separate Firefox window, click Continue through the opening, enter the **usual Gate code**, and name the companion normally. The review identity is selected only by the local server. Existing active-owner credentials are still checked by the normal Gate service; there is no authentication bypass or production route. The read-only recipient mapping lets the review see the owner's configured message content without editing content rows. A separate localhost origin and browser profile isolate cookies and opening/checkpoint storage.

To reopen after stopping the preview: `node scripts/serve-fresh-review.mjs --open` from the project root. It reuses the same manifest/player; it does not reset a later played review. Do not start a duplicate server if port 5051 is still running.

The local gateway refuses writes outside that review identity and the normal append-only entry logs. Owner/configuration/asset writes are denied, imported owner sessions are rejected, and Admin login/routes are unavailable on this dedicated review server. The script refuses production runtime markers and binds only to loopback. Nothing was added to the deployed app's auth flow.

`isolation-after.json` confirms the owner state and older review state exactly match the pre-work snapshots, and the final player's gameplay state is empty. No existing audit log was removed or altered. No authentication credential or secret was printed. Only this project's preview processes were restarted (normal preview 5050 and dedicated review 5051); Ahmed's existing browser windows were not closed or navigated.

## Checks and limitations

- Full `npm run test`: **999 passed** (46 schema + 559 backend + 394 web), before the final two small regression additions. The subsequent delivery-error component test passed; the recovery suite including its additional recurring-reward guard passed **8/8**. Thus all 1001 distinct tests have passed, though not in one final aggregate run.
- `npm run typecheck`: passed. Final web and backend rebuilds passed.
- `npm run lint`: passed; final security boundary scan passed.
- `npm run format:check`: only the same four pre-existing historical evidence files are flagged, as in the Phase 3 closure report. They were left intact. Edited/new files were formatted individually.
- `verify-review-progression.mjs --fixed`: passed, including request failure/retry and ordinary clicks through the Museum Hall.
- `verify-review-isolation.mjs`: passed wrong-code rejection, correct-code isolated session, empty fresh state, and owner/configuration/asset write rejection.
- `verify-review-opening.mjs`: passed black opening → normal Gate code → doors → Beach → empty naming → saved companion name on a **separate fixture player**.
- `verify-review-countdown.mjs`: final 60 layout/localization/browser/zoom combinations passed.
- World API authorization regressions passed, including the new recovery route.

The live first-visit message currently has five enabled locale rows and **zero written locale texts**. A new full journey will honestly pause there until Ahmed supplies the first-message content, then Retry can deliver it and opening it reaches the Farm. This task did not authorize inventing that personal content. Other content gaps recorded in Phase 3 remain. Existing-browser attachment was unavailable, so no claim is made that the exact active tab was directly reproduced or repaired in place. No live owner action was performed to test the repair. The original attached-screenshot comparison could not be made because no attachment was available; the actual two Cottage paintings and final browser renders were used.

No later milestone was implemented: no Gemini, birthday-event implementation, deployment, voice-over, Firebase Storage or stars.

## Files changed by this pass

Backend: `world/arcade.ts`, `world/cottage.ts`, `world/journey.ts`, `api/world.ts`, `errors/app-error.ts`; contracts: `api-error.ts`, `world-ui-text.ts`; web: `views/CottageView.tsx`, `views/Exterior.tsx`, `views/MuseumView.tsx`, `placeComposition.ts`, `world.module.css`.

Tests: `review-recovery.test.ts`, `world-locations.test.ts`, `world-api.test.ts`, `reviewRepair.test.tsx`. Scripts: `review-isolation.mjs`, `serve-fresh-review.mjs`, `verify-review-isolation.mjs`, `verify-review-progression.mjs`, `verify-review-opening.mjs`, `verify-review-countdown.mjs`. This report and gitignored evidence complete the handoff.
