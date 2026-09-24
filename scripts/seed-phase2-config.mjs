#!/usr/bin/env node
/**
 * Phase 2 configuration seed (append-only, idempotent): registers the five-language
 * `world_*` interface labels in 08_UI_TEXT and the two new `entry_event_type`
 * values (`first_journey_completed`, `song_request`) in 39_VALIDATION_LISTS.
 * Adds no tab, changes no existing row, and writes no player data. Manually
 * invoked (npm run seed:phase2:config); excluded from `npm run test`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  seedPhase2EntryEventTypes,
  seedWorldUiText,
} from '../apps/functions/lib/services/phase2-config-seed.service.js';

const client = createGoogleSheetsClientOrNull();
if (!client) {
  console.error('BLOCKER: no Google credential available. Stopping.');
  process.exit(1);
}
const gateway = new SheetGateway(client, { ttlSeconds: 60 });
const types = await seedPhase2EntryEventTypes(gateway);
console.log(
  `entry_event_type: created [${types.created.join(', ')}], unchanged [${types.unchanged.join(', ')}]`,
);
const text = await seedWorldUiText(gateway);
console.log(
  `08_UI_TEXT world_*: created ${text.created.length}, already present ${text.existing.length}`,
);
