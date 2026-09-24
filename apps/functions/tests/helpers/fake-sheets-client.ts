import type { GoogleSheetsClient, SpreadsheetMetadata } from '../../src/google/types.js';

function parseCellRef(ref: string): { col: number; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) throw new Error(`Invalid cell reference "${ref}"`);
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters!) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col: col - 1, row: Number(rowStr) };
}

/**
 * In-memory stand-in for the Google Sheets API, driven by a plain
 * { tabName: string[][] } workbook (header row + data rows). Implements just
 * enough real Sheets semantics (A1-style single-cell updates, append-to-end)
 * for the gateway's read/cache/update/append behavior to be tested without
 * the network or real credentials.
 */
export class FakeGoogleSheetsClient implements GoogleSheetsClient {
  public callCounts = {
    getMetadata: 0,
    getValues: 0,
    batchGetValues: 0,
    updateValues: 0,
    batchUpdateValues: 0,
    appendValues: 0,
  };

  constructor(
    private workbook: Record<string, string[][]>,
    private title = 'Fixture Workbook',
  ) {}

  async getMetadata(): Promise<SpreadsheetMetadata> {
    this.callCounts.getMetadata++;
    return {
      spreadsheetId: 'fixture-spreadsheet-id',
      title: this.title,
      tabTitles: Object.keys(this.workbook),
    };
  }

  async getValues(range: string): Promise<string[][]> {
    this.callCounts.getValues++;
    const tab = range.split('!')[0]!;
    const table = this.workbook[tab];
    return table ? table.map((row) => [...row]) : [];
  }

  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    this.callCounts.batchGetValues++;
    const out: Record<string, string[][]> = {};
    for (const range of ranges) {
      const tab = range.split('!')[0]!;
      const table = this.workbook[tab];
      out[tab] = table ? table.map((row) => [...row]) : [];
    }
    return out;
  }

  async updateValues(range: string, values: string[][]): Promise<void> {
    this.callCounts.updateValues++;
    const [tab, cellRef] = range.split('!');
    if (!tab || !cellRef)
      throw new Error(`FakeGoogleSheetsClient requires "Tab!A1" ranges, got "${range}"`);
    const { col, row } = parseCellRef(cellRef);
    const table = this.workbook[tab];
    if (!table) throw new Error(`Unknown tab "${tab}" in fake client`);

    values.forEach((rowValues, ri) => {
      const targetRowIndex = row - 1 + ri;
      if (!table[targetRowIndex]) table[targetRowIndex] = [];
      rowValues.forEach((cellValue, ci) => {
        table[targetRowIndex]![col + ci] = cellValue;
      });
    });
  }

  async batchUpdateValues(updates: { range: string; values: string[][] }[]): Promise<void> {
    this.callCounts.batchUpdateValues++;
    const before = this.callCounts.updateValues;
    for (const update of updates) await this.updateValues(update.range, update.values);
    this.callCounts.updateValues = before;
  }

  async appendValues(range: string, values: string[][]): Promise<void> {
    this.callCounts.appendValues++;
    const tab = range.split('!')[0]!;
    if (!this.workbook[tab]) this.workbook[tab] = [];
    for (const row of values) this.workbook[tab]!.push(row);
  }

  getTabSnapshot(tab: string): string[][] {
    const table = this.workbook[tab];
    return table ? table.map((row) => [...row]) : [];
  }
}
