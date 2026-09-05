import type { GoogleSheetsClient, SpreadsheetMetadata } from '../../src/google/types.js';

type ClientMethod = keyof GoogleSheetsClient;

interface FailurePlan {
  skip: number;
  fail: number;
}

/**
 * Wraps a real client (typically `FakeGoogleSheetsClient`) and throws for a
 * chosen range of calls to a chosen method — used to prove Sheet-outage
 * safety and partial-write retry reconciliation without any real network
 * dependency.
 */
export class FlakyGoogleSheetsClient implements GoogleSheetsClient {
  private plans = new Map<ClientMethod, FailurePlan>();
  private callCounts = new Map<ClientMethod, number>();

  constructor(private readonly inner: GoogleSheetsClient) {}

  /** Fails the next `count` calls to `method`, starting immediately. */
  failNextCalls(method: ClientMethod, count: number): void {
    this.plans.set(method, { skip: 0, fail: count });
  }

  /** Lets the next `skip` calls to `method` succeed, then fails the following `fail` calls. */
  failAfterCalls(method: ClientMethod, skip: number, fail: number): void {
    this.plans.set(method, { skip, fail });
  }

  private maybeFail(method: ClientMethod): void {
    const count = (this.callCounts.get(method) ?? 0) + 1;
    this.callCounts.set(method, count);

    const plan = this.plans.get(method);
    if (!plan) return;

    if (count <= plan.skip) return;
    if (count <= plan.skip + plan.fail) {
      throw new Error(`Simulated transient failure for ${method} (call #${count})`);
    }
  }

  async getMetadata(): Promise<SpreadsheetMetadata> {
    this.maybeFail('getMetadata');
    return this.inner.getMetadata();
  }

  async getValues(range: string): Promise<string[][]> {
    this.maybeFail('getValues');
    return this.inner.getValues(range);
  }

  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    this.maybeFail('batchGetValues');
    return this.inner.batchGetValues(ranges);
  }

  async updateValues(range: string, values: string[][]): Promise<void> {
    this.maybeFail('updateValues');
    return this.inner.updateValues(range, values);
  }

  async appendValues(range: string, values: string[][]): Promise<void> {
    this.maybeFail('appendValues');
    return this.inner.appendValues(range, values);
  }
}
