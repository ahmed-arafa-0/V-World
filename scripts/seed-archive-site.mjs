#!/usr/bin/env node
/**
 * Idempotently registers the archived previous-birthday-site URL into
 * `34_MUSEUM_EXHIBITS.exhibit_old_site.source_content_id` — a raw
 * `https://` URL, never a Drive file ID (the one authorized exception to
 * "media comes from Drive"; see `world/museum.ts`'s `validHttpsUrl` and
 * `services/archive-site-seed.service.ts`). Manually invoked
 * (npm run seed:archive-site) — excluded from `npm run test`. Never touches
 * any other column or exhibit.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { seedArchiveSite } from '../apps/functions/lib/services/archive-site-seed.service.js';

const URL = process.argv[2] ?? 'https://varcountdown.web.app/';

const sheetsClient = createGoogleSheetsClientOrNull();
if (!sheetsClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}

const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });
const outcome = await seedArchiveSite(gateway, URL);

switch (outcome.kind) {
  case 'rejected':
    console.log(`BLOCKED: ${outcome.reason}`);
    console.log('Nothing was written to 34_MUSEUM_EXHIBITS.');
    process.exit(1);
    break;
  case 'exhibit_not_found':
    console.log('BLOCKED: 34_MUSEUM_EXHIBITS.exhibit_old_site does not exist in the live Sheet.');
    console.log('Nothing was written.');
    process.exit(1);
    break;
  case 'created_field':
    console.log(`CREATED   34_MUSEUM_EXHIBITS.exhibit_old_site.source_content_id = ${URL}`);
    break;
  case 'updated':
    console.log(`UPDATED   34_MUSEUM_EXHIBITS.exhibit_old_site.source_content_id = ${URL}`);
    break;
  case 'unchanged':
    console.log(
      'UNCHANGED 34_MUSEUM_EXHIBITS.exhibit_old_site.source_content_id (already set to this URL)',
    );
    break;
}
