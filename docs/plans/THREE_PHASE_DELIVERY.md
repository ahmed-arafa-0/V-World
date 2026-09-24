# Three-Phase Delivery Plan — Attribution and Scope

**Status:** Active
**Recorded:** 2026-09-16
**Attribution:** This three-phase delivery structure and the "proceed automatically within a phase" cadence were instructed directly by Ahmed on 2026-09-16, superseding the earlier per-internal-milestone approval-request cadence for the milestones grouped inside an authorized phase.

## 1. What this document changes, and what it does not

The Living Bible §2A and the Master Build Plan §2 ("Claude receives only one milestone prompt at a time... Claude must not implement later milestones early") describe a cadence where Ahmed/ChatGPT reviews and accepts each milestone before the next is sent. Ahmed's 2026-09-16 instruction changes **only the request cadence**, grouping milestones into three macro phases and asking that work proceed through an entire authorized phase without stopping for approval after every internal milestone inside it.

**Unchanged by this document** (still fully in force):

- CLAUDE.md rule 3's boundary rule: never start work belonging to a **future phase** early (e.g. no M08+ work during Phase 1).
- Every milestone/checkpoint inside an authorized phase still requires its own runnable build, quality gates (format, lint, typecheck, unit/integration tests, build, relevant Playwright tests), and evidence — CLAUDE.md rule 15/16 apply exactly as before, just without pausing for a go/no-go message between each internal step.
- Google Sheets remains authoritative for content/config/state; Drive remains the only media source; no Firebase Storage; React never touches private credentials; Gemini stays deferred to M15; five-language/RTL-LTR support; keys-only collectibles; stable IDs and idempotent mutations.
- No unapproved product content (gameplay rules, religious copy, personal messages, final art, narration/dialogue text) may be invented. Where the Living Bible marks a decision **Open**, it stays open; Phase 1 work must isolate any feature that depends on an open decision and continue independent authorized work around it (per CLAUDE.md rule 13 and the current instruction).
- Nothing in this document authorizes a commit, merge, push, or deployment. Those remain separate, explicitly-requested actions.

This is recorded as a documented **cadence update**, not a silent conflict resolution, per CLAUDE.md rule 13 — the Living Bible/Master Build Plan's per-milestone gate is a _process_ decision (§2, "Locked"), and Ahmed, as the sole product owner and the author of that process decision, is the only person able to change it. No content, architecture, or acceptance-criteria decision in either document was altered.

## 2. Phase boundaries

### Phase 1 (current)

- Remaining M03 work: (A) verify/fix the M03-B1 Drive media gateway and finish its cache-policy/locale-normalization loose ends; (B) register the existing map assets (transparent island, top-down ocean loop, ocean poster) through the real schema/gateway with a developer-only live-map composition preview; (C) finish the M03 narration/dialogue runtime for five locales (originally scoped as a "voice/caption runtime" — Ahmed's 2026-09-17 decision removed voice-over entirely, see Living Bible §3A-1; the text-only runtime and its localized Continue action satisfy this item now).
- M04 — Player state, checkpoints, keys, idempotent rewards.
- M05 — Scene engine, camera, movement, overlapping connectors (prototype chain: Beach focus → Beach + three steps → near steps + Church approach → Church focus).
- M06 — First Opening: Bootstrap and Gate.
- M07 — Marevi Cove, naming, and three steps.
- Extension points for later locations/event overlays/audio policy (Church full stop, Café interaction-start, Arcade SFX-only+reduced Walkman — all unaffected by the voice-over removal, which concerns narration/dialogue only), without implementing Phase 2/3 gameplay.
- Asset handoff and narration/dialogue content documentation for everything Phase 1 needs (voice-over cue tracking is retired — see §3).

**Explicitly out of scope for Phase 1:** the complete Church interior system (M08), any other M08+ system, Gemini/VAR AI (M15), the birthday event (M16), the full Admin panel (M17), and setting `first_journey_completed`.

### Phase 2

M08–M14: location systems (Church, Vinyl Café, VARcade, Cottage/Marcelino, Sunberry Fields, The Everkeep) and the complete authored first journey ending in the Map unlock.

### Phase 2 status (2026-09-19)

M08–M14 are implemented and verified at the Phase 2 boundary — see `docs/plans/PHASE_2_PROGRESS.md`, `docs/reports/PHASE_2_EVIDENCE.md`, and the consolidated missing-content list `docs/assets/PHASE_2_HANDOFF.md`. Nothing from Phase 3 has been started.

### Phase 3

M15–M18: optional AI (Gemini, deferred exactly to M15 per CLAUDE.md rule 8), the birthday event engine, the full Admin panel, and release/integration/performance/deployment work.

## 3. Asset and content handoff model for Phase 1

- Higgsfield supplies new visuals/animation through a **separate asset handoff** process — this repository does not call any generation service and does not assume Higgsfield connectivity. `docs/assets/PHASE_1_ASSET_HANDOFF.md` lists what is reusable now versus what is still needed, matched to the real `10_ASSETS`/`09_ICONS` schema.
- **Retired 2026-09-17 (Ahmed's decision — see Living Bible §3A-1):** voice-over is removed from the entire experience. Ahmed no longer supplies voice-over recordings; the earlier "Ahmed supplies all voice-over after approving scripts" handoff step no longer applies. `docs/content/PHASE_1_VOICEOVER_CUES.md` is marked RETIRED and kept only as history — its dialogue text content (the wording, not the audio-cue tracking) remains a valid reference for what `15_DIALOGUE` should say, now presented as text with a localized Continue action instead of a synchronized recording.

## 4. Resuming this work

See `docs/plans/PHASE_1_PROGRESS.md` for the live, per-item checkpoint log, current baseline, and exact next action. That document is the authoritative "what's done / what's next" record for a new session — this document only records the phase boundaries and their attribution.
