# Phase 1 — Item C: Voice/Caption Runtime

**Date:** 2026-09-16
**Scope:** A reusable voice-over playback component/hook (captions, timing-agnostic pause/replay, missing-file continuation, one minimal autoplay-enable gesture) consuming the already-typed `16_VOICEOVER`/`15_DIALOGUE` data from `/api/content/runtime` (M03-A) and the M03-B1 `/api/media/:assetId` gateway; a Voice/Caption Runtime Lab acceptance screen; and the audio handoff manifest. No speech is synthesized anywhere in this codebase.

**Superseded 2026-09-17:** Ahmed removed voice-over from the entire experience. The `VoiceoverPlayer`/`useVoiceoverPlayback`/`resolveVoiceoverCue`/`VoiceoverRuntimeLab` code described below was replaced by a text-only `narrative/` module and `NarrativeRuntimeLab`. This report is left unedited as a historical record of what was built and verified at the time — see `docs/reports/PHASE1_VOICEOVER_REMOVAL_CHECKPOINT.md` and `docs/Veoullas_World_Living_Bible.md` §3A-1.

---

## 0. Preflight

Read `docs/Claude_Code_Master_Build_Plan.md`'s M03 acceptance criteria, `docs/Veoullas_World_Living_Bible.md` §3A/§8A/§18J (bottom captions, autoplay-then-gesture-fallback, missing-translation fallback), `docs/reports/M03_A_CHECKPOINT.md` (confirmed `RuntimeDialogueLine`/`RuntimeVoiceoverEntry` and their `voiceoverMediaRef`/`mediaRef` resolution already exist and need no backend change), and `docs/reports/PHASE1_A_CHECKPOINT.md`/`PHASE1_B_CHECKPOINT.md` (baseline).

**Live Sheet read (read-only) before writing any UI**, to ground the acceptance screen in real data rather than fabricated fixtures — see `docs/content/PHASE_1_VOICEOVER_CUES.md` §1a for the full finding. Summary: two dialogue groups (`dlg_gate_01`, `dlg_name_01`) already exist live, pre-dating this session, in states that exercise exactly the required M03 acceptance behaviors for free — a fully-registered-but-placeholder-Drive-ID voice-over (`dlg_gate_01`) and a referenced-but-nonexistent voice-over plus a missing-locale case (`dlg_name_01`). No fixture dialogue was invented to demonstrate these paths; real ones already existed.

## 1. Files changed / created

**New (frontend, `apps/web`):**

- `src/features/voiceover/resolveVoiceoverCue.ts` — `resolveDialogueCue()`/`resolveVoiceoverCue()`, mirroring `resolveUiText()`'s exact fallback chain (exact locale → English → safe placeholder, never a raw ID) for dialogue-sourced and event/other-content-sourced voice-over cues respectively.
- `src/features/voiceover/useVoiceoverPlayback.ts` — `useVoiceoverPlayback(cue, cueKey)`: attempts autoplay on mount/cue change, resolves to `blocked` on `NotAllowedError` (the one minimal user-gesture fallback), `unavailable` on any other play failure or a native `error` event (e.g. a 404 from an unfilled placeholder Drive file), `no-audio` when the cue has no `mediaRef` at all, `ended` on the native `ended` event, plus `togglePause`/`replay`/`enableAudio` actions. Never synthesizes audio — only ever attempts to play `cue.mediaRef`.
- `src/features/voiceover/VoiceoverPlayer.tsx` + `.module.css` — renders the bottom caption (Living Bible §8A) unconditionally, plus status-appropriate controls/notes.
- `src/features/voiceover/VoiceoverRuntimeLab.tsx` + `.module.css` — the M03 acceptance screen (§3 below).

**Modified (frontend):**

- `src/features/gate/GatePage.tsx` — adds `<VoiceoverRuntimeLab />` alongside `ContentRuntimeLab`/`MapCompositionPreview` in the authenticated-owner branch.
- `tests/GatePage.test.tsx` — adds an `HTMLMediaElement.prototype.play`/`pause` stub in `beforeEach` (the authenticated view now also renders the voice-over lab); no Gate-specific assertion changed.

**New (frontend tests):**

- `apps/web/tests/resolveVoiceoverCue.test.ts` (9 tests).
- `apps/web/tests/VoiceoverPlayer.test.tsx` (13 tests): no-cue renders nothing; caption always renders with correct `dir`; fallback/missing notes; no-audio state (no `<audio>` element rendered at all); successful autoplay reaching `playing` with working pause/replay/ended-event handling; blocked-autoplay showing the enable-audio gesture and recovering after the click; unavailable via both a native `error` event after successful play _and_ a rejected initial `play()` call.
- `apps/web/tests/VoiceoverRuntimeLab.test.tsx` (8 tests): loading; five-language switcher; one demo section per live `dialogue_id`; English-fallback note when a locale is missing; lab-level `dir` follows the selected language's own direction independent of any per-cue fallback; empty-state message; offline/retry.

**No backend change** — `16_VOICEOVER`/`15_DIALOGUE` resolution, including `voiceoverMediaRef`, was already fully built in M03-A; this item is frontend-only.

**Not committed.**

## 2. Behavior implemented against the Master Build Plan's M03 acceptance criteria

| Acceptance criterion                                                     | How it's met                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "One test screen switches through all five languages without reload"     | `VoiceoverRuntimeLab`'s switcher, same pattern as `ContentRuntimeLab`'s (proven again here independently).                                                                                                                                                                                                                                                                                                                         |
| "Missing audio still shows the full caption and does not block progress" | `no-audio` and `unavailable` statuses both leave the caption rendered; proven against a real live 404 in `npm run verify:phase1:full-app` (§4), not only mocked tests.                                                                                                                                                                                                                                                             |
| Browser autoplay attempt plus one minimal enable-audio action if blocked | `useVoiceoverPlayback` attempts `.play()` immediately; on `NotAllowedError` shows exactly one "🔊 Tap to enable audio" button, never more than one gesture.                                                                                                                                                                                                                                                                        |
| Pause/replay                                                             | `togglePause`/`replay`, unit-tested including a real DOM `currentTime` reset assertion.                                                                                                                                                                                                                                                                                                                                            |
| Per-line caption timing fields                                           | `caption_start_ms`/`caption_end_ms` are already carried through to `RuntimeVoiceoverEntry` (M03-A); this item does not yet drive a scrolling/timed-highlight caption from them (see §6 known limitations) — the single-caption-per-cue model used here shows the whole line for the cue's duration, which is sufficient for Phase 1's own acceptance path (single-line dialogue) but not yet a multi-segment lyric-style timeline. |
| Never synthesize a voice                                                 | Confirmed: no TTS/speech-synthesis dependency exists anywhere in `package.json` or the new code; playback only ever attempts `cue.mediaRef`, a same-origin `/api/media/...` path already resolved from a real `10_ASSETS` row.                                                                                                                                                                                                     |
| Draft wording/timings are fixtures only, not approved content            | No new dialogue text was authored by this item. The two real dialogue groups used for the acceptance screen (`dlg_gate_01`/`dlg_name_01`) pre-date this session and are displayed exactly as `ContentRuntimeLab` already displays arbitrary live dialogue — not new exposure. `docs/content/PHASE_1_VOICEOVER_CUES.md` explicitly does not reproduce that text and flags its approval status as unknown/open, per instruction.     |

## 3. The Voice/Caption Runtime Lab

Renders one `VoiceoverPlayer` per distinct `dialogue_id` currently enabled in `/api/content/runtime` — **not** hardcoded to `dlg_gate_01`/`dlg_name_01** by ID — so it automatically covers whatever dialogue exists today or is added later without a code change, and works identically against the `mockApi.ts` test fixture (`dlg_boot`) in unit tests. Sits in the same owner-session-gated `GatePage.tsx`branch as`ContentRuntimeLab`/`MapCompositionPreview`.

## 4. Live verification performed

Per the instruction to test real browser behavior where relevant and to distinguish metadata-only checks from actual rendering (raised during Phase 1 items A/B review, `docs/reports/PHASE1_B_CHECKPOINT.md` §9.3), this item is verified by the same `npm run verify:phase1:full-app` script extended in that addendum — the REAL built app, REAL backend, REAL Sheet, real headless Chromium, a minted (never Gate-code-derived) owner session:

```text
=== Real Content Runtime Lab, Voice/Caption Lab, and Map Preview all render ===
  PASS  ContentRuntimeLab rendered
  PASS  VoiceoverRuntimeLab rendered
  PASS  MapCompositionPreview rendered composed media (local/dev environment)

=== Real voice/caption cue against real live Sheet content ===
  PASS  At least one real dialogue caption rendered with non-empty text

=== No uncaught browser console/page errors during the whole flow ===
  PASS  Zero unexpected console/page errors
  INFO  1 known missing-audio 404(s) logged by the browser (expected — dlg_gate_01's
        placeholder Drive file). The app did not crash and still rendered a caption
        for it.

Summary: 6 passed, 0 failed
```

This is real, not simulated, proof that: the real browser requested `/api/media/asset_vo_gate_01_en?v=1`, the real backend correctly 404'd it (an unfilled blueprint placeholder Drive file, exactly as `resolveMediaAsset`'s `cleanDriveIdValue`/`isPlaceholder` logic is supposed to do), the real `<audio>` element's `error` event fired in a real browser, and the real React component caught it and kept the caption visible instead of crashing or blocking — the full missing-file-continuation path, end to end, against real infrastructure.

## 5. Commands run and results

```text
npm run format         → PASS
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 543/543 across 49 files (46 sheet-schema + 317 functions + 180 web)
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run verify:phase1:full-app       → PASSED, 6/6 (real browser, real Sheet, real backend — see §4)
```

No `firebase deploy` was run. No real Gate code, Admin password, session ID, cookie value, private key, or Google credential was printed anywhere in this session.

## 6. Known limitations

- **`caption_start_ms`/`caption_end_ms` are not yet used to drive a timed/segmented caption display** — the current model shows one full caption per cue for as long as the cue is active, which satisfies Phase 1's own single-line acceptance path but not a future multi-segment timed-lyric or word-highlight caption style, should that be required later.
- **The audio-element `HTMLMediaElement.prototype.pause` "Not implemented" jsdom console warning** appears cosmetically in some test runs due to React Testing Library's automatic unmount-cleanup ordering versus per-test `vi.spyOn`/`mockRestore` timing across adjacent tests in the same file. All affected tests still pass (verified: 0 failures); this is test-harness console noise, not an application defect, and was not chased further since it does not affect correctness or CI pass/fail.
- **`dlg_name_01`'s it/el/fr dialogue rows do not exist yet**, and its `voiceover_id` references do not resolve to any `16_VOICEOVER` row in any locale (§1a) — both are real Sheet-authoring gaps for Ahmed to address, not implementation gaps in this item; the runtime already handles both gracefully (English fallback; no-audio state).
- **No dedicated live, credential-gated Playwright spec** (`tests/e2e/*.spec.ts`) was added for the voice/caption lab specifically — covered instead by the stronger `verify:phase1:full-app` real-browser script (§4), which does not require `E2E_GATE_CODE`. Adding a `tests/e2e/voiceover-runtime-lab.spec.ts` mirroring `content-runtime-lab.spec.ts`'s credential-gated structure is a reasonable follow-up for when Ahmed sets that credential locally, but is not required to prove this item's behavior.

## 7. Confirmations

- Only Phase 1 item C was implemented. No M04+ (D/E/F/G) work was started.
- No new dialogue/voice-over content was authored, approved, or published by this session. The two live dialogue groups used for acceptance testing pre-date this session and their approval status remains explicitly unresolved in `docs/content/PHASE_1_VOICEOVER_CUES.md` §1a.
- No speech was synthesized anywhere in this codebase at any point.
- Nothing was committed, merged, pushed, or deployed.

## 8. Completion addendum — resumed handoff audit

The handoff audit found that `caption_start_ms`/`caption_end_ms` were transported in the standalone voice-over entries but dropped when a dialogue row resolved its voice-over. That gap is now closed: the sanitized dialogue contract carries the linked duration/window, `resolveDialogueCue()` preserves it, and `VoiceoverPlayer` tracks the real audio element's `timeupdate` position to activate the caption during the configured window. Missing, unavailable, or autoplay-blocked audio still leaves the full caption visible. A timing-window test was added. The shared jsdom media base stubs also remove the earlier cosmetic `HTMLMediaElement` warning noise without weakening the explicit autoplay/error tests.
