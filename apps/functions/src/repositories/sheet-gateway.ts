import {
  buildValidationListSets,
  getTableTabDefinition,
  parseTab,
  type NormalizedRow,
  type ParseTabResult,
  type TabName,
} from '@veoullas-world/sheet-schema';
import { AppError } from '../errors/app-error.js';
import type { GoogleSheetsClient, SpreadsheetMetadata } from '../google/types.js';
import { TtlCache } from './cache.js';
import { KeyMutex } from './key-mutex.js';
import { withRetry } from './retry.js';

export interface SheetGatewayOptions {
  ttlSeconds?: number;
}

export interface ReadOptions {
  bypass?: boolean;
}

export type TableTabName = Exclude<TabName, '00_README'>;

function columnLetter(index0Based: number): string {
  let n = index0Based + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function resolvePrimaryKeyColumn(tabName: TableTabName): string | null {
  const def = getTableTabDefinition(tabName);
  return def.primaryKey;
}

/**
 * The one backend-only Google Sheets gateway. React never sees this module;
 * every route that needs Sheet data goes through here so no caller ever
 * touches raw cell coordinates or the Google client directly.
 */
export class SheetGateway {
  private cache: TtlCache;
  private mutex = new KeyMutex();

  constructor(
    private readonly client: GoogleSheetsClient,
    options?: SheetGatewayOptions,
  ) {
    this.cache = new TtlCache(options?.ttlSeconds ?? 60);
  }

  setTtlSeconds(seconds: number): void {
    this.cache.setTtlSeconds(seconds);
  }

  get ttlSeconds(): number {
    return this.cache.ttlSeconds;
  }

  get cacheEntryCount(): number {
    return this.cache.size;
  }

  async getMetadata(options?: ReadOptions): Promise<SpreadsheetMetadata> {
    return this.cache.getOrLoad(
      '__metadata__',
      () => withRetry(() => this.client.getMetadata()),
      options,
    );
  }

  async getRawTab(tabName: TabName, options?: ReadOptions): Promise<string[][]> {
    return this.cache.getOrLoad(
      `raw:${tabName}`,
      () => withRetry(() => this.client.getValues(tabName)),
      options,
    );
  }

  async getRawTabsBatch(
    tabNames: TabName[],
    options?: ReadOptions,
  ): Promise<Record<string, string[][]>> {
    const result: Record<string, string[][]> = {};
    const missing: TabName[] = [];

    for (const name of tabNames) {
      if (!options?.bypass) {
        const cached = this.cache.peek<string[][]>(`raw:${name}`);
        if (cached) {
          result[name] = cached;
          continue;
        }
      }
      missing.push(name);
    }

    if (missing.length > 0) {
      const batchKey = `batch:${[...missing].sort().join(',')}`;
      const fetched = await this.cache.getOrLoad(
        batchKey,
        () => withRetry(() => this.client.batchGetValues(missing)),
        { bypass: options?.bypass },
      );
      for (const name of missing) {
        const values = fetched[name] ?? [];
        this.cache.set(`raw:${name}`, values);
        result[name] = values;
      }
    }

    return result;
  }

  async getValidationLists(options?: ReadOptions): Promise<Record<string, Set<string>>> {
    const raw = await this.getRawTab('39_VALIDATION_LISTS', options);
    const [header, ...rows] = raw;
    return buildValidationListSets(header ?? [], rows);
  }

  async readTab(tabName: TableTabName, options?: ReadOptions): Promise<ParseTabResult> {
    const def = getTableTabDefinition(tabName);
    const [raw, validationLists] = await Promise.all([
      this.getRawTab(tabName, options),
      this.getValidationLists(options),
    ]);
    const [header, ...rows] = raw;
    return parseTab(def, header ?? [], rows, validationLists);
  }

  async readTabsBatch(
    tabNames: TableTabName[],
    options?: ReadOptions,
  ): Promise<Record<string, ParseTabResult>> {
    const [rawByTab, validationLists] = await Promise.all([
      this.getRawTabsBatch(tabNames, options),
      this.getValidationLists(options),
    ]);
    const out: Record<string, ParseTabResult> = {};
    for (const name of tabNames) {
      const def = getTableTabDefinition(name);
      const [header, ...rows] = rawByTab[name] ?? [];
      out[name] = parseTab(def, header ?? [], rows, validationLists);
    }
    return out;
  }

  async readEnabledRows(tabName: TableTabName, options?: ReadOptions): Promise<NormalizedRow[]> {
    const result = await this.readTab(tabName, options);
    return result.rows.filter((r) => r.values.enabled === true);
  }

  async findByPrimaryKey(
    tabName: TableTabName,
    primaryKeyValue: string,
    options?: ReadOptions,
  ): Promise<{ row: NormalizedRow; header: string[] } | null> {
    const def = getTableTabDefinition(tabName);
    const raw = await this.getRawTab(tabName, options);
    const [header, ...dataRows] = raw;
    const validationLists = await this.getValidationLists(options);
    const parsed = parseTab(def, header ?? [], dataRows, validationLists);

    const matches = parsed.rows.filter((r) => r.primaryKeyValue === primaryKeyValue);
    if (matches.length > 1) {
      throw new AppError(
        'DUPLICATE_PRIMARY_KEY',
        `Primary key "${primaryKeyValue}" matches more than one row.`,
      );
    }
    if (matches.length === 0) return null;
    return { row: matches[0]!, header: header ?? [] };
  }

  /**
   * Updates only the explicitly supplied columns for the row matching
   * primaryKeyValue. Every other cell — including columns this milestone
   * doesn't know about and any formula-driven column — is never written to.
   */
  async updateByPrimaryKey(
    tabName: TableTabName,
    primaryKeyValue: string,
    patch: Record<string, string>,
  ): Promise<Record<string, string>> {
    return this.mutex.run(`${tabName}:${primaryKeyValue}`, async () => {
      const found = await this.findByPrimaryKey(tabName, primaryKeyValue, { bypass: true });
      if (!found) {
        throw new AppError(
          'ROW_NOT_FOUND',
          `No row with primary key "${primaryKeyValue}" in ${tabName}.`,
        );
      }

      const primaryKeyColumn = resolvePrimaryKeyColumn(tabName);
      const safePatch = { ...patch };
      if (primaryKeyColumn) delete safePatch[primaryKeyColumn];

      const { row: currentRow, header } = found;
      const sheetRow = currentRow.rowIndex + 1; // +1 for the header row

      for (const [column, value] of Object.entries(safePatch)) {
        const colIndex = header.indexOf(column);
        if (colIndex === -1) continue;
        const range = `${tabName}!${columnLetter(colIndex)}${sheetRow}`;
        await withRetry(() => this.client.updateValues(range, [[value]]));
      }

      this.cache.invalidate(`raw:${tabName}`);

      return { ...currentRow.raw, ...safePatch };
    });
  }

  /** Appends a row by header name. Rejects a duplicate primary key rather than silently accepting it. */
  async appendRow(
    tabName: TableTabName,
    values: Record<string, string>,
  ): Promise<Record<string, string>> {
    const primaryKeyColumn = resolvePrimaryKeyColumn(tabName);

    if (primaryKeyColumn) {
      const pkValue = values[primaryKeyColumn];
      if (!pkValue || pkValue.trim() === '') {
        throw new AppError(
          'invalid_request',
          `A non-blank "${primaryKeyColumn}" is required to append to ${tabName}.`,
        );
      }
      return this.mutex.run(`${tabName}:${pkValue}`, async () => {
        const existing = await this.findByPrimaryKey(tabName, pkValue, { bypass: true });
        if (existing) {
          throw new AppError(
            'DUPLICATE_PRIMARY_KEY',
            `Primary key "${pkValue}" already exists in ${tabName}.`,
          );
        }
        return this.appendRowRaw(tabName, values);
      });
    }

    return this.appendRowRaw(tabName, values);
  }

  private async appendRowRaw(
    tabName: TableTabName,
    values: Record<string, string>,
  ): Promise<Record<string, string>> {
    const raw = await this.getRawTab(tabName, { bypass: true });
    const header = raw[0] ?? [];
    const rowArray = header.map((col) => values[col] ?? '');
    await withRetry(() => this.client.appendValues(tabName, [rowArray]));
    this.cache.invalidate(`raw:${tabName}`);

    // Return the full header-mapped row (not just the caller's input object)
    // so a fresh append and an idempotent "already exists" read return the
    // exact same shape.
    const fullRow: Record<string, string> = {};
    header.forEach((col, i) => {
      if (col) fullRow[col] = rowArray[i] ?? '';
    });
    return fullRow;
  }

  /**
   * Idempotent append keyed by primaryKeyValue: a retry of the same
   * transaction returns the original successful result instead of
   * duplicating a row. Foundation only — no reward/progress semantics live
   * here yet.
   */
  async appendIfAbsent(
    tabName: TableTabName,
    primaryKeyValue: string,
    buildRow: () => Record<string, string>,
  ): Promise<{ created: boolean; row: Record<string, string> }> {
    return this.mutex.run(`${tabName}:${primaryKeyValue}`, async () => {
      const existing = await this.findByPrimaryKey(tabName, primaryKeyValue, { bypass: true });
      if (existing) {
        return { created: false, row: existing.row.raw };
      }
      const newRow = buildRow();
      const appended = await this.appendRowRaw(tabName, newRow);
      return { created: true, row: appended };
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}
