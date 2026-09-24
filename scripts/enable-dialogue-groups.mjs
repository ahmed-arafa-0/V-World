#!/usr/bin/env node
/**
 * Enables the 80 first-journey dialogue rows (16 groups x 5 locales) that
 * `content-completion-v1-dialogue-seed.service.ts` inserted `enabled: 'FALSE'` by design. Ahmed
 * authorized activating this already-inserted, already-translated content. Manually invoked
 * (npm run enable:dialogue-groups) — excluded from `npm run test`. Never touches `dlg_gate`/
 * `dlg_naming` (the pre-existing 7 rows), never inserts a new row, only patches `enabled` on rows
 * that already exist and are still `FALSE`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { activateDialogueGroupProposals } from '../apps/functions/lib/services/content-completion-v1-dialogue-activate.service.js';

const sheetsClient = createGoogleSheetsClientOrNull();
if (!sheetsClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60, maxRequestsPerMinute: 52 });
const outcome = await activateDialogueGroupProposals(gateway);

for (const id of outcome.enabled) console.log(`  ENABLED         15_DIALOGUE.${id}`);
for (const id of outcome.alreadyEnabled) console.log(`  ALREADY ENABLED 15_DIALOGUE.${id}`);
for (const id of outcome.missing) console.log(`  MISSING         15_DIALOGUE.${id}`);
console.log(
  `\nenabled ${outcome.enabled.length}, already enabled ${outcome.alreadyEnabled.length}, missing ${outcome.missing.length} (expected 80 total, 0 missing).`,
);
if (outcome.missing.length > 0) {
  console.log(
    '\nSome expected rows were not found in 15_DIALOGUE — re-run the dialogue seed first (npm run seed:content-banks-v1 or its own seed path) before activating.',
  );
  process.exit(1);
}
