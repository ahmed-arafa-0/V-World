#!/usr/bin/env node
/**
 * Island-completion Museum/Arcade text pass: activates the already-drafted
 * (but disabled) exhibit/game/location UI-text rows and adds the three
 * missing Museum wing display names. See
 * `apps/functions/src/services/island-completion-museum-arcade-text-seed.service.ts`
 * for exactly what it touches and why. Manually invoked; excluded from `npm run test`.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  activateMuseumArcadeText,
  seedMuseumWingText,
} from '../apps/functions/lib/services/island-completion-museum-arcade-text-seed.service.js';

const client = createGoogleSheetsClientOrNull();
if (!client) {
  console.error('BLOCKER: no Google credential available. Stopping.');
  process.exit(1);
}
const gateway = new SheetGateway(client, { ttlSeconds: 60 });

const activated = await activateMuseumArcadeText(gateway);
console.log(
  `08_UI_TEXT activated: ${activated.updated.length}, missing: ${activated.missing.length}`,
);
if (activated.missing.length) console.log('  missing:', activated.missing.join(', '));

const wings = await seedMuseumWingText(gateway);
console.log(
  `08_UI_TEXT wing names created: ${wings.created.length}, already present: ${wings.existing.length}`,
);
