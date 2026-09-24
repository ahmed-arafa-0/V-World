#!/usr/bin/env node
/**
 * One-time structural setup: creates the two new tabs this pass' schema adds
 * (`42_ARCADE_TRIVIA`, `43_COMPANION_HINTS`) in the real Google Sheet, with
 * their header row, if they do not already exist. Uses the Sheets API
 * directly (spreadsheets.batchUpdate `addSheet` + a header `values.update`)
 * since no tab-creation call exists in `RealGoogleSheetsClient` — every
 * other tab in this Sheet was created by hand, this is the first time a tab
 * is created programmatically, and it is scoped to ONLY adding two new,
 * empty, additively-named tabs: no existing tab, row, or column is touched.
 * Manually invoked; excluded from `npm run test`.
 */
import { google } from 'googleapis';
import { loadGoogleServiceAccount } from '../apps/functions/lib/config/google-credential-loader.js';
import { getSheetResourceConfig } from '../apps/functions/lib/config/resource-config.js';
import { getTableTabDefinition } from '../packages/sheet-schema/dist/index.js';

const NEW_TABS = ['42_ARCADE_TRIVIA', '43_COMPANION_HINTS'];

const { credential, status } = loadGoogleServiceAccount();
if (!status.googleServiceAccount.present || !credential) {
  console.error('BLOCKER: no Google credential available. Stopping.');
  process.exit(1);
}
const { spreadsheetId } = getSheetResourceConfig();
const auth = new google.auth.GoogleAuth({
  credentials: credential,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId });
const existingTitles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));

for (const tabName of NEW_TABS) {
  if (existingTitles.has(tabName)) {
    console.log(`${tabName}: already exists, skipping creation.`);
    continue;
  }
  const def = getTableTabDefinition(tabName);
  const header = def.columns.map((c) => c.name);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  console.log(`${tabName}: tab created.`);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header] },
  });
  console.log(`${tabName}: header row written (${header.length} columns).`);
}

console.log('Done. No existing tab, row, or column was modified.');
