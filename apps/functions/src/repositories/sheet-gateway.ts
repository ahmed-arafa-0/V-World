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
import { PacedSheetsClient, RequestPacer } from './request-pacer.js';

export interface SheetGatewayOptions {
  ttlSeconds?: number;
  /** Upstream read requests, and separately write requests, allowed per minute before further ones wait (unset: unpaced, as in tests). */
  maxRequestsPerMinute?: number;
}

export interface ReadOptions {
  bypass?: boolean;
  /**
   * With `bypass`, insist on a genuine upstream read. Without it, a `bypass` read accepts a copy that
   * THIS process fetched within the last {@link FRESH_REUSE_MS} and has not written to since: several
   * fresh reads inside one player action then cost one request instead of five, while every write
   * (which invalidates the tab) and every optimistic re-check still see the real Sheet.
   */
  strict?: boolean;
  /** With `bypass`: how recent (ms) a copy this process fetched and has not written to may be. Default {@link FRESH_REUSE_MS}. */
  maxAgeMs?: number;
}

/** The window inside which a just-fetched, unmodified tab counts as fresh for a `bypass` read. */
export const FRESH_REUSE_MS = 2_500;

/**
 * Configuration tabs the world reads on nearly every action. When one of them has to be fetched, any
 * of the others that are missing or expired ride along in the same request, so a minute of play
 * refreshes the whole configuration with ONE Sheets call instead of about ten.
 */
export const CONFIG_TABS: readonly TabName[] = [
  '01_APP_CONFIG',
  '07_LANGUAGES',
  '08_UI_TEXT',
  '09_ICONS',
  '10_ASSETS',
  '11_LOCATIONS',
  '14_STORY_BEATS',
  '15_DIALOGUE',
  '20_SONGS',
  '21_KEYS',
  '22_KEY_RULES',
  '23_ACHIEVEMENTS',
  '28_FARM_CROPS',
  '30_CHURCH_CONTENT',
  '31_CHURCH_QUIZ',
  '32_ARCADE_GAMES',
  '34_MUSEUM_EXHIBITS',
  '39_VALIDATION_LISTS',
];

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

  private readonly client: GoogleSheetsClient;

  constructor(client: GoogleSheetsClient, options?: SheetGatewayOptions) {
    this.client = options?.maxRequestsPerMinute
      ? new PacedSheetsClient(
          client,
          new RequestPacer(options.maxRequestsPerMinute),
          new RequestPacer(options.maxRequestsPerMinute),
        )
      : client;
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

  private fetchedAt = new Map<string, number>();

  async getRawTab(tabName: TabName, options?: ReadOptions): Promise<string[][]> {
    const key = `raw:${tabName}`;
    if (options?.bypass && !options.strict) {
      const at = this.fetchedAt.get(key);
      const maxAge = options.maxAgeMs ?? FRESH_REUSE_MS;
      const cached =
        at !== undefined && Date.now() - at < maxAge ? this.cache.peek<string[][]>(key) : undefined;
      if (cached) return cached;
    }
    return this.cache.getOrLoad(
      key,
      async () => {
        const rows = await this.coalescedRead(tabName);
        this.fetchedAt.set(key, Date.now());
        return rows;
      },
      options,
    );
  }

  private readBatch: {
    tabs: Map<TabName, { resolve: (v: string[][]) => void; reject: (e: unknown) => void }>;
  } | null = null;

  /**
   * Tabs requested in the same tick (e.g. one `Promise.all` of several reads) go upstream as ONE
   * batched request instead of one request each: the Sheets quota is per request, not per tab.
   * A lone tab is still read exactly as before.
   */
  private coalescedRead(tabName: TabName): Promise<string[][]> {
    return new Promise<string[][]>((resolve, reject) => {
      if (!this.readBatch) {
        const batch = { tabs: new Map() as NonNullable<SheetGateway['readBatch']>['tabs'] };
        this.readBatch = batch;
        // After every already-queued microtask, so a whole chain of same-turn reads is batched.
        setImmediate(() => {
          this.readBatch = null;
          void this.flushReadBatch(batch.tabs);
        });
      }
      this.readBatch.tabs.set(tabName, { resolve, reject });
    });
  }

  private async flushReadBatch(
    tabs: NonNullable<SheetGateway['readBatch']>['tabs'],
  ): Promise<void> {
    const names = [...tabs.keys()];
    try {
      const wanted = new Set<TabName>(names);
      const extras: TabName[] = [];
      if (names.some((n) => CONFIG_TABS.includes(n))) {
        for (const tab of CONFIG_TABS) {
          if (!wanted.has(tab) && this.cache.peek(`raw:${tab}`) === undefined) extras.push(tab);
        }
      }
      if (names.length === 1 && extras.length === 0) {
        tabs.get(names[0]!)!.resolve(await withRetry(() => this.client.getValues(names[0]!)));
        return;
      }
      const all = [...names, ...extras];
      const fetched = await withRetry(() => this.client.batchGetValues(all));
      for (const tab of extras) {
        this.cache.set(`raw:${tab}`, fetched[tab] ?? []);
        this.fetchedAt.set(`raw:${tab}`, Date.now());
      }
      for (const name of names) tabs.get(name)!.resolve(fetched[name] ?? []);
    } catch (err) {
      for (const waiter of tabs.values()) waiter.reject(err);
    }
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
        this.fetchedAt.set(`raw:${name}`, Date.now());
        result[name] = values;
      }
    }

    return result;
  }

  /**
   * Validation lists are configuration, not per-player state: a `bypass` requested to see a fresh
   * player row must not also re-read this tab (it doubled the upstream calls of every write).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getValidationLists(_options?: ReadOptions): Promise<Record<string, Set<string>>> {
    const raw = await this.getRawTab('39_VALIDATION_LISTS');
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

  /**
   * Same as calling `readEnabledRows` once per tab, but as one batched
   * Sheets API request instead of N separate ones — use this whenever a
   * caller needs enabled rows from several tabs at once (N individual
   * concurrent reads is real, measured pressure on Google's per-minute
   * Sheets API quota, not just a style preference).
   */
  async readEnabledRowsBatch(
    tabNames: TableTabName[],
    options?: ReadOptions,
  ): Promise<Record<string, NormalizedRow[]>> {
    const parsedByTab = await this.readTabsBatch(tabNames, options);
    const out: Record<string, NormalizedRow[]> = {};
    for (const name of tabNames) {
      out[name] = parsedByTab[name]!.rows.filter((r) => r.values.enabled === true);
    }
    return out;
  }

  async findByPrimaryKey(
    tabName: TableTabName,
    primaryKeyValue: string,
    options?: ReadOptions,
  ): Promise<{ row: NormalizedRow; header: string[] } | null> {
    const raw = await this.getRawTab(tabName, options);
    return this.findInRaw(tabName, primaryKeyValue, raw);
  }

  /**
   * A fresh (uncached) lookup that also hands back the raw tab, so the caller can write from what it
   * just read instead of reading the same tab again.
   */
  async findFresh(
    tabName: TableTabName,
    primaryKeyValue: string,
  ): Promise<{
    found: { row: NormalizedRow; header: string[] } | null;
    raw: string[][];
  }> {
    const raw = await this.getRawTab(tabName, { bypass: true, strict: true });
    return { found: await this.findInRaw(tabName, primaryKeyValue, raw), raw };
  }

  private async findInRaw(
    tabName: TableTabName,
    primaryKeyValue: string,
    raw: string[][],
  ): Promise<{ row: NormalizedRow; header: string[] } | null> {
    const def = getTableTabDefinition(tabName);
    const [header, ...dataRows] = raw;
    const validationLists = await this.getValidationLists();
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
    /** A row the caller has JUST read fresh: skips this method's own re-read of the tab. */
    known?: { row: NormalizedRow; header: string[] } | null,
  ): Promise<Record<string, string>> {
    return this.mutex.run(`${tabName}:${primaryKeyValue}`, async () => {
      const found =
        known ?? (await this.findByPrimaryKey(tabName, primaryKeyValue, { bypass: true }));
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

      const updates: { range: string; values: string[][] }[] = [];
      for (const [column, value] of Object.entries(safePatch)) {
        const colIndex = header.indexOf(column);
        if (colIndex === -1) continue;
        updates.push({
          range: `${tabName}!${columnLetter(colIndex)}${sheetRow}`,
          values: [[value]],
        });
      }
      // One upstream request for the whole patch (cell-by-cell writes multiplied both latency and
      // write-quota use). Writing the same cells again is harmless, so a retry is safe.
      if (updates.length > 1 && this.client.batchUpdateValues) {
        await withRetry(() => this.client.batchUpdateValues!(updates));
      } else {
        for (const update of updates) {
          await withRetry(() => this.client.updateValues(update.range, update.values));
        }
      }

      this.writeThroughRow(tabName, header, currentRow.rowIndex, safePatch);

      return { ...currentRow.raw, ...safePatch };
    });
  }

  /** Appends a row by header name. Rejects a duplicate primary key rather than silently accepting it. */
  async appendRow(
    tabName: TableTabName,
    values: Record<string, string>,
    /** The tab exactly as the caller JUST read it fresh, proving the key is absent (no re-read). */
    knownAbsentRaw?: string[][],
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
        const raw = knownAbsentRaw ?? (await this.getRawTab(tabName, { bypass: true }));
        const existing = await this.findInRaw(tabName, pkValue, raw);
        if (existing) {
          throw new AppError(
            'DUPLICATE_PRIMARY_KEY',
            `Primary key "${pkValue}" already exists in ${tabName}.`,
          );
        }
        return this.appendRowRaw(tabName, values, raw);
      });
    }

    return this.appendRowRaw(tabName, values);
  }

  private async appendRowRaw(
    tabName: TableTabName,
    values: Record<string, string>,
    prefetched?: string[][],
  ): Promise<Record<string, string>> {
    const raw = prefetched ?? (await this.getRawTab(tabName, { bypass: true }));
    const header = raw[0] ?? [];
    const rowArray = header.map((col) => values[col] ?? '');
    await withRetry(() => this.client.appendValues(tabName, [rowArray]));
    this.writeThroughAppend(tabName, [rowArray]);

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
      const raw = await this.getRawTab(tabName, { bypass: true });
      const existing = await this.findInRaw(tabName, primaryKeyValue, raw);
      if (existing) {
        return { created: false, row: existing.row.raw };
      }
      const newRow = buildRow();
      const appended = await this.appendRowRaw(tabName, newRow, raw);
      return { created: true, row: appended };
    });
  }

  /**
   * Batch form of an idempotent append: reads the tab once, then appends every
   * row whose primary key is absent in a single write. Existing rows (and
   * duplicates inside `rows`) are never touched or re-added.
   */
  async appendRowsIfAbsent(
    tabName: TableTabName,
    rows: Record<string, string>[],
  ): Promise<{ created: string[]; existing: string[] }> {
    const primaryKeyColumn = resolvePrimaryKeyColumn(tabName);
    if (!primaryKeyColumn) {
      throw new AppError('invalid_request', `${tabName} has no primary key for a batch append.`);
    }
    return this.mutex.run(`${tabName}:batch`, async () => {
      const raw = await this.getRawTab(tabName, { bypass: true });
      const header = raw[0] ?? [];
      const keyIndex = header.indexOf(primaryKeyColumn);
      const seen = new Set(raw.slice(1).map((r) => r[keyIndex] ?? ''));
      const created: string[] = [];
      const existing: string[] = [];
      const toAppend: string[][] = [];
      for (const row of rows) {
        const key = row[primaryKeyColumn];
        if (!key || key.trim() === '') {
          throw new AppError(
            'invalid_request',
            `A non-blank "${primaryKeyColumn}" is required to append to ${tabName}.`,
          );
        }
        if (seen.has(key)) {
          existing.push(key);
          continue;
        }
        seen.add(key);
        created.push(key);
        toAppend.push(header.map((col) => row[col] ?? ''));
      }
      if (toAppend.length > 0) {
        await withRetry(() => this.client.appendValues(tabName, toAppend));
        this.writeThroughAppend(tabName, toAppend);
      }
      return { created, existing };
    });
  }

  /** Milliseconds since this process last fetched the tab from Google (Infinity if never or written since). */
  tabAgeMs(tabName: TabName): number {
    const at = this.fetchedAt.get(`raw:${tabName}`);
    return at === undefined ? Infinity : Date.now() - at;
  }

  private invalidateTab(tabName: TabName): void {
    this.cache.invalidate(`raw:${tabName}`);
    this.fetchedAt.delete(`raw:${tabName}`);
  }

  /**
   * Applies a just-confirmed row patch to the cached copy of the tab instead of dropping it, so the
   * next same-process read (this action's own follow-up reads, above all) sees the new value without
   * a second upstream round trip. Falls back to a plain invalidation if nothing is cached yet.
   *
   * Reads a fresh snapshot and replaces the cache entry synchronously (no `await` in between), so two
   * write-throughs never interleave with each other. Two DIFFERENT rows of the same tab written by two
   * concurrent requests can still race on which snapshot each started from; the loser's patch would
   * then be momentarily missing from a third party's cached read of the tab (never from its own row,
   * and never from the Sheet itself, which always receives every write independently). That narrow
   * window self-heals via the tab's normal TTL and the optimistic strict re-read `mutateWorldDoc`
   * already does whenever its copy is not fresh enough — the same safety net that protects every write
   * today, unaffected by this cache optimization.
   */
  private writeThroughRow(
    tabName: TabName,
    header: string[],
    rowIndex: number,
    patch: Record<string, string>,
  ): void {
    const key = `raw:${tabName}`;
    const raw = this.cache.peek<string[][]>(key);
    if (!raw || !raw[rowIndex]) {
      this.invalidateTab(tabName);
      return;
    }
    const nextRaw = raw.slice();
    const nextRow = nextRaw[rowIndex]!.slice();
    for (const [column, value] of Object.entries(patch)) {
      const colIndex = header.indexOf(column);
      if (colIndex !== -1) nextRow[colIndex] = value;
    }
    nextRaw[rowIndex] = nextRow;
    this.cache.set(key, nextRaw);
    this.fetchedAt.set(key, Date.now());
  }

  /** Same idea as {@link writeThroughRow}, for one or more just-appended rows. */
  private writeThroughAppend(tabName: TabName, appendedRows: string[][]): void {
    const key = `raw:${tabName}`;
    const raw = this.cache.peek<string[][]>(key);
    if (!raw) {
      this.invalidateTab(tabName);
      return;
    }
    this.cache.set(key, [...raw, ...appendedRows]);
    this.fetchedAt.set(key, Date.now());
  }

  clearCache(): void {
    this.fetchedAt.clear();
    this.cache.clear();
  }
}
