#!/usr/bin/env node
/**
 * Local, non-deployed Phase 2 PREVIEW with SAMPLE content: the real built app and
 * backend over an in-memory Sheet/Drive (no live Sheet, no real owner progress).
 * Gate code for this preview only: 4821. Run `npm run build` first.
 */
import { startPhase2Fixture, M02_FAKE_GATE_CODE, ART_PACK_PRESENT } from './lib/phase2-fixture.mjs';

const port = Number(process.env.PORT ?? 5051);
const { origin } = await startPhase2Fixture({ port, artPack: true });
console.log(`Phase 2 sample-content preview: ${origin}`);
console.log(`Gate code (preview fixture only): ${M02_FAKE_GATE_CODE}`);
console.log(
  ART_PACK_PRESENT
    ? 'Artwork: the selected art pack is registered for this preview only (local files, never public).'
    : 'Artwork: pack/derivatives not found - run npm run art:derivatives.',
);
console.log('All content is labelled SAMPLE; data lives in memory and resets when this stops.');
