export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  tabTitles: string[];
}

/**
 * Thin seam over the Google Sheets API so the gateway (and everything above
 * it) can be tested against a deterministic fake instead of the network.
 * Only the operations the gateway actually needs are exposed here.
 */
export interface GoogleSheetsClient {
  getMetadata(): Promise<SpreadsheetMetadata>;
  getValues(range: string): Promise<string[][]>;
  batchGetValues(ranges: string[]): Promise<Record<string, string[][]>>;
  updateValues(range: string, values: string[][]): Promise<void>;
  appendValues(range: string, values: string[][]): Promise<void>;
}
