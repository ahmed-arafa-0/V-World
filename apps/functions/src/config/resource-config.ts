/**
 * Backend-only infrastructure locators. The Google Sheet ID is not editable
 * world content and not a secret, but it must never be hard-coded into the
 * frontend or exposed over the API — it lives here, with an environment
 * variable override so a later deployment milestone can point at a
 * different spreadsheet without a code change.
 */

const DEFAULT_SPREADSHEET_ID = '12nXHFAHOpjNGUZkUJSKhgUW5eTn-0kUaEaZCdIeVmNI';

export interface SheetResourceConfig {
  spreadsheetId: string;
}

export function getSheetResourceConfig(): SheetResourceConfig {
  const override = process.env.GOOGLE_SHEET_ID?.trim();
  return {
    spreadsheetId: override && override.length > 0 ? override : DEFAULT_SPREADSHEET_ID,
  };
}
