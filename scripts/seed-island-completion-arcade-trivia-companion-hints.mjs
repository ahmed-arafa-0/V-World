#!/usr/bin/env node
/**
 * Island-completion pass, part 2: seeds the Arcade Trivia starter question
 * bank and the scripted-companion hint bank, then flips `32_ARCADE_GAMES`
 * `game_maze`/`game_trivia` to `enabled: TRUE` (their display names were
 * already activated by `seed-island-completion-museum-arcade-text.mjs`).
 * See `apps/functions/src/services/island-completion-arcade-trivia-companion-hints-seed.service.ts`
 * for exactly what content this writes. Manually invoked; excluded from `npm run test`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  seedArcadeTriviaQuestions,
  seedCompanionHints,
} from '../apps/functions/lib/services/island-completion-arcade-trivia-companion-hints-seed.service.js';

const client = createGoogleSheetsClientOrNull();
if (!client) {
  console.error('BLOCKER: no Google credential available. Stopping.');
  process.exit(1);
}
const gateway = new SheetGateway(client, { ttlSeconds: 60 });

const trivia = await seedArcadeTriviaQuestions(gateway);
console.log(
  `42_ARCADE_TRIVIA created: ${trivia.created.length}, already present: ${trivia.existing.length}`,
);

const hints = await seedCompanionHints(gateway);
console.log(
  `43_COMPANION_HINTS created: ${hints.created.length}, already present: ${hints.existing.length}`,
);

for (const gameId of ['game_maze', 'game_trivia']) {
  const found = await gateway.findByPrimaryKey('32_ARCADE_GAMES', gameId, { bypass: true });
  if (!found) {
    console.log(`SKIPPED: ${gameId} not found in 32_ARCADE_GAMES.`);
    continue;
  }
  if (found.row.values.enabled === true) {
    console.log(`${gameId}: already enabled.`);
    continue;
  }
  await gateway.updateByPrimaryKey('32_ARCADE_GAMES', gameId, { enabled: 'TRUE' });
  console.log(`${gameId}: enabled.`);
}
