import type { GoogleSheetsClient, SpreadsheetMetadata } from '../google/types.js';

/**
 * Smooths bursts of upstream requests so a run of ordinary player actions does not trip the Sheets
 * per-minute quota (which the API answers with a 429 and a long silent backoff). A request that would
 * exceed the budget waits for the window to move on; the wait itself is bounded, after which the
 * request goes ahead anyway and a genuine 429 is handled by the gateway's retry.
 */
export class RequestPacer {
  private stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly maxWaitMs = 2_500,
  ) {}

  async acquire(): Promise<void> {
    const started = Date.now();
    for (;;) {
      const now = Date.now();
      while (this.stamps.length > 0 && now - this.stamps[0]! >= this.windowMs) this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(now);
        return;
      }
      const wait = this.stamps[0]! + this.windowMs - now;
      if (now - started + wait > this.maxWaitMs) {
        this.stamps.push(now);
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, wait + 5));
    }
  }
}

/**
 * The same client, with every request passing through a pacer first. Google meters read and write
 * requests separately (about 60 of each per minute per user), so each kind has its own budget.
 */
export class PacedSheetsClient implements GoogleSheetsClient {
  batchUpdateValues?: (updates: { range: string; values: string[][] }[]) => Promise<void>;

  constructor(
    private readonly inner: GoogleSheetsClient,
    private readonly reads: RequestPacer,
    private readonly writes: RequestPacer = reads,
  ) {
    if (inner.batchUpdateValues) {
      this.batchUpdateValues = async (updates) => {
        await this.writes.acquire();
        return inner.batchUpdateValues!(updates);
      };
    }
  }

  async getMetadata(): Promise<SpreadsheetMetadata> {
    await this.reads.acquire();
    return this.inner.getMetadata();
  }
  async getValues(range: string, valueRenderOption?: 'FORMULA'): Promise<string[][]> {
    await this.reads.acquire();
    return this.inner.getValues(range, valueRenderOption);
  }
  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    await this.reads.acquire();
    return this.inner.batchGetValues(ranges);
  }
  async updateValues(range: string, values: string[][]): Promise<void> {
    await this.writes.acquire();
    return this.inner.updateValues(range, values);
  }
  async appendValues(range: string, values: string[][]): Promise<void> {
    await this.writes.acquire();
    return this.inner.appendValues(range, values);
  }
}
