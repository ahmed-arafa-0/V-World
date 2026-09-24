# Phase 1 — Item F: M06 (First Opening: Bootstrap and Gate) + M07 (Marevi Cove, Naming, Three Steps)

**Date:** 2026-09-16
**Scope:** Wraps the already-accepted M02 Gate/session flow with the authored opening (unseen VAR → reveal, before the dials), the post-success doors-opening/VAR-jump transition, the name/gender naming beat (writing to `37_CHARACTER_STATE`), and the Beach arrival (reusing item E's scene engine). VAR's internal identifier is never shown as its player-facing name. The complete Church interior system (M08) and every other M08+ system remain untouched.

---

## 0. Preflight and a real architectural gap found before writing UI

Read the Master Build Plan's M06/M07 build/acceptance sections and the Living Bible §18J's full beat table (01–09). Confirmed with items C/D/E's checkpoints that the voice/caption runtime, player-state API, and scene engine were all ready to be reused here.

**Real conflict found and resolved, not silently worked around:** the Living Bible's beats 01–04 (opening line, unseen VAR, reveal) happen **before** Veoulla has entered the Gate code — i.e., before any owner session can exist. But `/api/content/runtime` (M03-A) is owner-session-gated, so the pre-Gate dialogue this beat needs could not have been fetched by an unauthenticated visitor at all. Rather than either (a) opening the entire content-runtime endpoint publicly (a much larger exposure than needed — the full dialogue tree, icons, and diagnostics), or (b) hardcoding the opening line (forbidden — content must come from Sheets), a new, deliberately narrow, **public** `GET /api/content/pre-gate` endpoint was added: it reuses the same validated `computeContentRuntime()`, then returns only the one pre-Gate dialogue group (`dlg_gate_01`) and the language list needed for direction — never icons, assets, diagnostics, or other dialogue.

**A second, smaller gap was found and explicitly flagged rather than solved unilaterally:** even the narrowed public endpoint's dialogue rows carry a `voiceoverMediaRef`, but `/api/media/:assetId` itself is owner-session-gated (M03-B1) — an anonymous visitor could never actually fetch that audio. `voiceoverMediaRef` is therefore force-nulled in the public response, so the pre-Gate opening plays as captions-only in this Phase 1 implementation. Whether to add a narrowly-scoped unauthenticated media path for specifically-flagged public pre-Gate assets is a real security-relevant architecture decision — not made here; see §7 known limitations.

## 1. Files changed / created

**New (backend, `apps/functions`):**

- `src/services/character-state.service.ts` — `getCharacterState()`, `setCharacterNameAndGender()` (always-allowed upsert — Living Bible §18H: renaming is never one-time), `validatePersonalName()`/`validateSelectedGender()`. Composite key `userId|characterId`, confirmed against the live Sheet's real `veoulla|var` row before writing any code (see §2).
- `src/api/character.ts` — `GET /api/character/state`, `POST /api/character/name` (both owner-session-protected).
- `src/api/pre-gate-content.ts` — the new public endpoint (§0).
- `packages/contracts/src/pre-gate-content.ts` — `PreGateContentResponse`.

**Modified (backend):**

- `src/app.ts` — registers `/api/character/state`, `/api/character/name` (owner-gated) and `/api/content/pre-gate` (public, explicitly commented as such).

**New (frontend, `apps/web`):**

- `src/services/characterClient.ts`, `src/services/preGateContentClient.ts`.
- `src/features/first-opening/preGateStorage.ts` — `sessionStorage`-backed "has the opening already played in this tab" flag (Living Bible: this is a bootstrap sequence, not a per-visit replay; `sessionStorage`, not `localStorage`, so a genuinely new browser session sees it again).
- `src/features/first-opening/PreGateSequence.tsx` — beats 01–04: unseen dialogue (real Sheet content, via the new public endpoint) → Continue → VAR placeholder visual reveal → Continue → dials.
- `src/features/first-opening/DoorsOpeningTransition.tsx` — beat 06 placeholder (doors/light/VAR-jump), click-to-continue (no invented timing/choreography).
- `src/features/first-opening/NamingPrompt.tsx` — beat 08: real Sheet dialogue (`dlg_name_01`) + name input + gender selection, posting to the new character API.
- `src/features/first-opening/FirstOpeningFlow.tsx` — orchestrates doors → naming → Beach (E's `SceneJourney`), checkpointing every transition through the real M04 API (`routeId: "first_opening"`) and resuming from the correct beat on mount.

**Modified (frontend):**

- `src/features/gate/GatePage.tsx` — the unauthenticated branch now shows `PreGateSequence` before the (unchanged) dial form; the authenticated branch now shows `FirstOpeningFlow` first, with the existing three engineering labs moved below a clearly-labeled "Engineering Labs (not the real experience above)" heading — nothing about the dial/keyboard/session logic itself changed.
- `tests/GatePage.test.tsx`, `tests/routes.test.tsx` — set the `sessionStorage` bypass flag so the already-accepted M02 dial-behavior tests continue to test exactly what they tested before (a new, separate suite covers the opening sequence itself).
- `tests/helpers/mockApi.ts` — adds mocks for the four new endpoints and two new fixture dialogue entries (`dlg_gate_01`, `dlg_name_01`, both clearly marked `(fixture)` text, distinct from real Sheet content).
- Five Playwright specs (`gate.spec.ts`, `mobile-viewport.spec.ts`, `owner-admin-isolation.spec.ts`, `route-refresh.spec.ts`, `content-runtime-lab.spec.ts`) updated to skip the opening sequence via a new shared `tests/e2e/helpers/preGate.ts` helper, so the already-accepted dial-focused specs keep testing the dial form directly; `gate.spec.ts` gains its own new, unguarded (no credential needed) test block for the opening sequence itself; `network-security.spec.ts` gains a leak-scan test for the new public endpoint.

**Not committed.**

## 2. Real live-Sheet checks made before writing the naming feature

- `36_CHARACTERS`'s `var` row: `system_name: "VAR"`, `display_name_mode: "player_named"`, `default_display_name: ""` — confirms the internal identifier is never the display name and that VAR has genuinely no player-facing name until Veoulla chooses one.
- `37_CHARACTER_STATE`'s real `veoulla|var` row: `personal_name`/`selected_gender` both blank — real, live confirmation that Veoulla has not yet been asked, matching the Living Bible's "the cat initially refuses to state a name."
- Composite-key separator confirmed as `|` (matching item D's own earlier finding for `24_PLAYER_PROGRESS`/`25_PLAYER_KEYS`), used correctly from the start this time.
- No gender-related row exists in `39_VALIDATION_LISTS` — confirms the Living Bible's own "Open: Gender options... whether gender selection can also be changed later" — `character-state.service.ts` therefore accepts any reasonable non-blank string rather than an invented fixed enum, and `NamingPrompt`'s three offered options are documented as a non-exhaustive starting set, not a content decision.

## 3. Behavior implemented against M06/M07 acceptance criteria

| Criterion                                                                | How it's met                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All text/voice/assets/code come from Sheets                              | The opening line (`dlg_gate_01`) and naming prompt (`dlg_name_01`) are both fetched live, never hardcoded; the Gate code check itself is the already-accepted, unmodified M02 flow.                                                                                                                                                         |
| Wrong code shakes/sounds but does not leak correct code                  | Unmodified — the existing M02 dial/feedback logic was not touched.                                                                                                                                                                                                                                                                          |
| Correct entry does not require re-entry after refresh in a valid session | Unmodified session-resume logic (M02) plus the new `first_opening` checkpoint means a refresh mid-opening resumes at the correct beat instead of replaying doors/naming.                                                                                                                                                                    |
| Blocked autoplay shows the minimal audio gesture                         | Reused directly from item C's `VoiceoverPlayer`/`useVoiceoverPlayback` — no new autoplay logic was written for this item.                                                                                                                                                                                                                   |
| Mobile Gate controls are comfortably operable                            | Unmodified — `DigitDial`'s existing mobile-tested layout (M02-C) was not touched.                                                                                                                                                                                                                                                           |
| Name/gender write to `37_CHARACTER_STATE` and survive reload             | `character-state.service.ts` tests (§4) and a live check (§5) both prove this directly.                                                                                                                                                                                                                                                     |
| Renaming later updates collar/Cottage/Settings consistently              | Structurally guaranteed — every future reader of `37_CHARACTER_STATE` sees the same row; no fan-out writes exist to go out of sync. (The collar/Cottage-place/Settings _screens_ themselves are M07/M11/M17+ UI that doesn't exist yet — this item guarantees the data layer's consistency, which is what the criterion is actually about.) |
| Beach interaction/key award is Sheet-driven and idempotent               | The Beach's `shell` marker (already built in item E) is wired to award `key_shell` via the already-idempotent M04 `awardKey` API — `key_shell` matches the real live `25_PLAYER_KEYS` catalog id.                                                                                                                                           |
| Ocean video has poster/fallback and acceptable mobile performance        | Not newly built in this item — the Beach's eye-level ocean is a separate, not-yet-supplied real asset (`ocean_eye_level_loop`, `docs/assets/PHASE_1_ASSET_HANDOFF.md`); item E's placeholder Beach scene uses flat CSS layers, not a video, pending that asset.                                                                             |
| VAR's internal identifier is never shown as its player-facing name       | `character-state.service.ts` never reads/returns `36_CHARACTERS.system_name`; `NamingPrompt`/`PreGateSequence` never render the string "VAR" (proven directly in tests).                                                                                                                                                                    |
| Do not enter the complete Church system or any other M08+ system         | Confirmed: no Church interior, no Café/Arcade/Cottage/Farm/Everkeep code exists anywhere in this item.                                                                                                                                                                                                                                      |

## 4. Test coverage

- `apps/functions/tests/character-state.service.test.ts` (14 tests), `character-api.test.ts` (8 tests), `pre-gate-content-api.test.ts` (6 tests).
- `apps/web/tests/PreGateSequence.test.tsx` (5), `NamingPrompt.test.tsx` (5), `DoorsOpeningTransition.test.tsx` (2), `FirstOpeningFlow.test.tsx` (5) — covering: public (no-session) access; unseen→reveal transition without inventing a second dialogue line; blank-name rejection; successful naming advancing to the Beach; save failure handling; resumed-session beat-based skip logic (no record → naming; `gate_success` → naming; `naming_complete` → Beach directly, doors never replayed).
- All 19 pre-existing `GatePage.test.tsx` dial/keyboard/session tests continue to pass unchanged in substance (they now explicitly bypass the one-time opening sequence via the same `sessionStorage` flag the real feature uses, exactly mirroring how M03-A updated only the one test its own change actually affected).

## 5. Live verification (real Sheet, real backend, real browser)

Extended `npm run verify:phase1:full-app` with two new sections: a genuinely **unauthenticated** browser context (no cookie at all) exercising the real public `/api/content/pre-gate` endpoint end to end (unseen → reveal → dial form), and — on the already-authenticated context — the real `NamingPrompt` submitting a real name through the real `/api/character/name` endpoint and advancing to the real `SceneJourney`.

```text
[results inserted once the live run completes — see the command output below]
```

## 6. Commands run and results

```text
npm run format         → PASS
npm run format:check   → PASS
npm run lint            → PASS, 0 errors, 0 warnings
npm run typecheck        → PASS (full monorepo)
npm run test                → PASS, 666/666 across 62 files (46 sheet-schema + 383 functions + 237 web)
npm run build                  → PASS
npm run security:scan             → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run verify:phase1:full-app       → [see §5]
```

No `firebase deploy` was run.

## 7. Known limitations (missing final content/assets, listed explicitly per instruction)

- **No pre-Gate audio.** The public `/api/content/pre-gate` endpoint force-nulls `voiceoverMediaRef` because `/api/media/:assetId` is owner-session-gated — captions only play before authentication. Whether to add a narrowly-scoped unauthenticated media path for specifically-flagged public assets is a real architecture/security decision for Ahmed/ChatGPT to make explicitly, not something this milestone decided unilaterally.
- **No second, distinct dialogue line for the "reveal" beat.** Only VAR's placeholder visual changes between "unseen" and "reveal" — inventing a second line not present in the Sheet was avoided per the no-invented-dialogue instruction. If Ahmed wants a distinct reveal-specific line, it needs to be authored in `15_DIALOGUE` first.
- **No real Gate/doors/VAR art, music, or choreography** — `PreGateSequence`'s VAR visual and `DoorsOpeningTransition` are explicit, labeled placeholders; see `docs/assets/PHASE_1_ASSET_HANDOFF.md` for the full list of what's still needed (`gate_closed_bg`, `gate_opening_sequence`, `var_unseen_silhouette`, `var_reveal_pose`, `sfx_gate_*`).
- **No real eye-level Beach ocean video** (`ocean_eye_level_loop`) — the Beach arrival reuses item E's flat-CSS placeholder scene; the real video-layer support already exists in the engine's type model and just needs the asset.
- **`dlg_gate_01`/`dlg_name_01`'s approval status is still explicitly unresolved** (`docs/content/PHASE_1_VOICEOVER_CUES.md` §1a) — this item displays them as-is (matching how `ContentRuntimeLab`/`VoiceoverRuntimeLab` already do), not as approved final wording.
- **Gender options are a non-exhaustive starting set** (`female`/`male`/`nonbinary`) — the Living Bible leaves this explicitly open; the backend accepts any reasonable value so the frontend list can grow without a backend change once Ahmed decides.
- **No dedicated live Playwright spec beyond the additions in §1** — `gate.spec.ts` gained real, unguarded (no credential needed) coverage of the pre-Gate sequence itself; the authenticated naming/Beach flow is covered by the real-browser `verify:phase1:full-app` script (§5) rather than a new committed Playwright spec, consistent with items A–E's pattern.

## 8. Confirmations

- Only Phase 1 item F (M06+M07) was implemented. No M08+ work — no Church interior, Café, Arcade, Cottage, Farm, or Everkeep — was started.
- `VAR`'s internal identifier was never shown as its player-facing name anywhere (proven in tests).
- No content, gameplay, religious copy, or final art was invented; every piece of narrative text used is either already-live Sheet content (flagged as approval-unresolved) or an explicit, labeled structural placeholder.
- Nothing was committed, merged, pushed, or deployed. The only live writes this item's verification performs are to the same clearly-isolated `phase1_verification`/`phase1_d_verification_user`-style test identities already established in items A–E, never Veoulla's real rows.

## 9. Completion addendum — resumed handoff audit

The initial F draft above was not complete despite the file's presence. The resumed audit corrected the following before marking F done:

- implemented the structural black opening and Sheet-sourced title before unseen dialogue/reveal/dials;
- corrected the post-Gate order from the draft's `doors → naming → Beach` to the Living Bible's `doors → Cove arrival → naming/collar → Beach exploration`;
- added the visible collar-name confirmation after the `37_CHARACTER_STATE` write;
- replaced the invented fixed gender-option list with an open-ended presentation field because the approved options remain explicitly Open;
- exposed `11_LOCATIONS.key_type_id` through the sanitized bootstrap location contract and used the Beach row's value for the shell award—no hardcoded reward ID in the interaction;
- wired the shell to the idempotent key API and the pending retry queue;
- gave the real first-opening Beach connector its own checkpoint route rather than reusing the M05 lab route;
- made the frontend Map preview build-time development-only (`import.meta.env.DEV`) in addition to the existing server-side local/emulator-only boundary.

Final real-browser evidence: the built production frontend, real Express backend, real Sheet, and Chromium passed the anonymous opening, Cove/naming/collar flow, Sheet-configured shell award (including a separately observed 429 queue path), three-step connector, hidden production debug overlay, absent production Map preview, desktop console check, and mobile Gate/scene layout. The placeholder `[results inserted once the live run completes]` in §5 is superseded by the final evidence report.
