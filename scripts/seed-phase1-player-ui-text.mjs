#!/usr/bin/env node
/**
 * Registers the player_* UI-text groups the scene/settings controls use
 * (five languages each) in 08_UI_TEXT. Idempotent and append-only: existing
 * rows are never modified. Manually invoked (npm run seed:phase1:ui-text);
 * excluded from `npm run test`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { seedPlayerUiText } from '../apps/functions/lib/services/phase1-player-ui-text-seed.service.js';

async function main() {
  const sheetsClient = createGoogleSheetsClientOrNull();
  if (!sheetsClient) {
    console.error('BLOCKER: no Google credential available. Stopping.');
    process.exit(1);
  }
  const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
  const outcome = await seedPlayerUiText(gateway);
  console.log(`created ${outcome.created.length}, already present ${outcome.existing.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
