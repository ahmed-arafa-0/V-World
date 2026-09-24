# Phase 1 A–G — Final Evidence

**Date:** 2026-09-17  
**Boundary:** Phase 1 only. No commit, push, merge, deployment, M08+ gameplay, Map unlock, or first-journey completion was performed.

**Superseding note (2026-09-17, same day):** This report's item C description ("voice/caption runtime") and its test/verification results below describe the codebase as it stood **before** Ahmed's later same-day decision to remove voice-over from the entire experience. That decision superseded item C's original scope; this report is left unedited as a historical record of what was actually built and verified at the time. See `docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md` for the voice-over removal's own evidence, and `docs/Veoullas_World_Living_Bible.md` §3A-1 for the decision record.

## 1. Handoff reconciliation

- Preserved Claude's complete dirty working tree; no reset, clean, checkout, or destructive replacement was used.
- Verified A/B in source and tests rather than relying only on their reports.
- Reconciled the reported A/B count: `492 - 464 = 28`. Of those, 26 were direct tests and 2 were the existing `import-boundary.test.ts` dynamic per-source-file cases for two added frontend files. The accepted A+B total remains 507/507.
- Confirmed the Map composition preview has two independent development boundaries:
  - backend `/api/dev/map-preview-assets` returns 404 outside local/emulator development before owner authentication;
  - frontend rendering is guarded by build-time `import.meta.env.DEV`, and the production-build browser verification confirmed that the preview is absent.
- Real Map media was browser-decoded through the existing authenticated gateway. No raw Drive ID or credential appeared in output or frontend artifacts.

## 2. Completed Phase 1 scope

- **C — voice/caption runtime:** five-locale resolution, caption timing windows, pause/replay, autoplay recovery, caption-only continuation, and the separate voice-over handoff manifest.
- **D — player state:** owner-scoped checkpoint/key/achievement APIs, authoritative dates, exact-transaction award idempotency across days, per-user read cache, and a retry queue for network/429/5xx checkpoint and award failures.
- **E — scene engine:** layered image/video rendering, particles, bounded pan, manual/guided rail movement, click-to-point markers, and checkpoint resume.
- **F — Gate and Beach:** Sheet-owned title and dialogue, opening/title/unseen/reveal/dials, doors, Cove arrival, naming, collar confirmation, Beach scene, and a Sheet-configured idempotent shell reward. All missing final media remains visibly identified as development placeholder material.
- **G — extension points:** stable slots for all eight Sheet location IDs, typed Church/Café/Arcade-capable audio policy, location-entry hooks, and deterministic event overlays. The production extension registry remains empty.

## 3. Final automated gates

```text
npm run format:check  → PASS
npm run lint          → PASS, 0 errors / 0 warnings
npm run typecheck     → PASS
npm run test          → PASS, 686/686 across 64 files
                         46 sheet-schema + 385 functions + 255 web
npm run build         → PASS
npm run security:scan → PASS, 3 production files scanned; no forbidden credential references
```

The full test run initially exposed a real focus race: the Gate's post-session auto-focus could steal focus after a player had already focused a dial. The Gate now focuses its root only when focus is not already inside it; the complete rerun passed 686/686.

## 4. Browser evidence

### Direct production-build journey

`npm run verify:phase1:full-app` passed **20/20** against the built React app, real Express backend, live Sheet-backed content, and headless Chromium. It used timestamped isolated verification identities and a minted owner session; Ahmed's Gate code was never read, guessed, entered, or printed.

Verified in that run:

- anonymous opening/title/unseen/reveal/dials and a real non-empty Sheet caption;
- four usable mobile dials with no horizontal overflow;
- resumed Cove arrival → naming → collar → Beach order;
- real character-state write under the isolated verification identity;
- production absence of the developer Map preview and scene debug overlay;
- Sheet-configured Beach shell award, including safe continuation when the live Sheet returned 429 and the mutation was queued with its stable transaction ID;
- Beach focus → exactly three rendered steps;
- no unexpected console/page errors;
- mobile Beach layout with no horizontal overflow.

Visual QA artifacts:

- `docs/reports/PHASE1/gate-mobile.png`
- `docs/reports/PHASE1/beach-desktop.png`
- `docs/reports/PHASE1/beach-mobile.png`

### Media gateway

`npm run verify:phase1:map-media-browser` passed **6/6**: Chromium decoded the island image, loaded playable ocean-video metadata and dimensions, and verified a 1,000-byte range response with status 206, valid `Content-Range`, and matching `Content-Length`.

### Firebase-emulator Playwright suite

The initial default cold start exceeded Firebase CLI's 10-second Functions-discovery window. Re-running with the CLI's `FUNCTIONS_DISCOVERY_TIMEOUT=60` override started the suite successfully and executed both desktop and mobile projects:

```text
46 passed
14 skipped (expected: E2E_GATE_CODE / E2E_ADMIN_PASSWORD were intentionally absent)
1 flaky (the first Admin backend-start check passed on retry)
1 failed (mobile repeat of the public pre-Gate endpoint received a live Google Sheets 429)
```

The failing screenshot showed the app's explicit retry UI with “The Google Sheets API rate limit was exceeded”; it was not a layout, sequencing, or browser-runtime assertion failure. The same public pre-Gate path passed in desktop Playwright and in the independent direct production-build browser run. This suite is therefore reported as partially passing with an external live-Sheet quota failure, not promoted to a clean pass.

## 5. Data and security boundaries

- No request body accepts a player-selected `userId`; owner identity comes from the session.
- Browser verification used clearly isolated generated identities. It did not mutate Veoulla's real progress row or historical entry logs.
- No code writes `first_journey_completed` or `map_unlocked`; the player's Map remains locked at the Phase 1 boundary.
- Sheets remain authoritative for title, dialogue, locations, reward key type, and player state. Drive remains authoritative for registered media; no raw Drive ID is sent to the frontend.
- Admin and owner middleware now map live Sheet failures to safe API responses rather than allowing an unhandled rejection.

## 6. Deliberately unresolved handoffs

- Ahmed still needs to approve the scripts and supply final voice-over recordings. Current missing/unapproved voice media continues as captions-only and is itemized in `docs/content/PHASE_1_VOICEOVER_CUES.md`.
- Higgsfield/final Gate, VAR, Cove/Beach, SFX, and related art remain a separate handoff in `docs/assets/PHASE_1_ASSET_HANDOFF.md`.
- Development fixtures and scene placeholders are labeled and isolated; none is claimed as approved final content.
- Public pre-Gate audio remains captions-only because the authenticated media gateway is intentionally not opened anonymously without a separate security decision.
- Final presentation/gender choices remain a product decision; Phase 1 stores the player's open-ended value instead of hardcoding an unapproved enum.
