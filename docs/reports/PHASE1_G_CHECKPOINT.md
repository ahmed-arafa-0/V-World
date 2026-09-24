# Phase 1 — Item G: Extension Points

**Date:** 2026-09-16  
**Scope:** Infrastructure-only seams for later Sheet-backed location packages, audio policy, and event overlays. No Phase 2/3 content or gameplay is implemented.

## 1. Implementation

- `apps/web/src/features/scene-engine/runtimeExtensions.ts`
  - stable extension slots for the eight existing `11_LOCATIONS.location_id` values;
  - `LocationExtension` entry callback;
  - typed `LocationAudioPolicy` capable of representing:
    - Church: background music stopped;
    - Café: song start only by deliberate interaction;
    - Arcade: game music disabled, SFX allowed, Walkman gain reduced;
  - deterministic priority-ordered `EventOverlayExtension` registry.
- `SceneJourney.tsx` resolves the current location extension on scene entry, exposes the resolved audio-policy state to the eventual audio runtime, and renders only overlays explicitly registered and active for the current scene.

The production registry is intentionally empty. Later milestones must populate it from approved Sheet-backed configuration/adapters; this checkpoint does not hardcode location content, songs, games, religious behavior, or birthday phases.

## 2. Tests

- `runtimeExtensions.test.tsx` proves all eight slots, the three named audio-policy shapes, and deterministic active-overlay ordering.
- `SceneJourney.test.tsx` proves a registered policy reaches the scene host and an active fixture overlay renders.

## 3. Boundary confirmation

- No Church interior, Café catalog/player, Arcade cabinet/game, Cottage, Farm, Everkeep interior, Map unlock, Gemini, birthday engine, Admin expansion, deployment, or release work was started.
- No `first_journey_completed` or `map_unlocked` write was added.
- No event overlay is active in production.
- Nothing was committed, pushed, merged, or deployed.

## 4. Verification

Final combined results are recorded in `docs/reports/PHASE_1_EVIDENCE.md`. At checkpoint completion: format, lint, typecheck, **686/686** unit/integration tests, build, security scan, **6/6** real-browser media checks, and the **20/20** direct real-app Chromium path passed. The Firebase-emulator Playwright suite's separate live-Sheet quota result is documented there without being promoted to a pass.
