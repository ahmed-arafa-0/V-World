import { afterEach, describe, expect, it, vi } from 'vitest';
import { PacedSheetsClient, RequestPacer } from '../src/repositories/request-pacer.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

afterEach(() => vi.useRealTimers());

describe('RequestPacer', () => {
  it('lets requests through under the budget with no wait', async () => {
    const pacer = new RequestPacer(3);
    const t0 = Date.now();
    await pacer.acquire();
    await pacer.acquire();
    await pacer.acquire();
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('holds a burst over the budget until the window moves on, instead of failing', async () => {
    vi.useFakeTimers();
    const pacer = new RequestPacer(2, 1000, 5000);
    await pacer.acquire();
    await pacer.acquire();
    let third = false;
    void pacer.acquire().then(() => (third = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(third).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(third).toBe(true);
  });

  it('never waits longer than its bound: a saturated window releases the request anyway', async () => {
    vi.useFakeTimers();
    const pacer = new RequestPacer(1, 60_000, 2000);
    await pacer.acquire();
    let second = false;
    void pacer.acquire().then(() => (second = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(second).toBe(true); // the 60 s wait would exceed the 2 s bound, so it goes straight ahead
  });

  it('paces every kind of request a client makes', async () => {
    const inner = new FakeGoogleSheetsClient({ A: [['h'], ['1']] });
    const reads = new RequestPacer(100);
    const writes = new RequestPacer(100);
    const readSpy = vi.spyOn(reads, 'acquire');
    const writeSpy = vi.spyOn(writes, 'acquire');
    const client = new PacedSheetsClient(inner, reads, writes);
    await client.getValues('A');
    await client.batchGetValues(['A']);
    await client.getMetadata();
    await client.updateValues('A!A2', [['x']]);
    await client.batchUpdateValues!([{ range: 'A!A2', values: [['y']] }]);
    await client.appendValues('A', [['z']]);
    // Reads and writes draw on separate budgets, as Google meters them.
    expect(readSpy).toHaveBeenCalledTimes(3);
    expect(writeSpy).toHaveBeenCalledTimes(3);
  });
});
