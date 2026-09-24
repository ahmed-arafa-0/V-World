import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionPending,
  onActionFailure,
  WORLD_POST_TIMEOUT_MS,
  worldApi,
} from '../src/features/world/worldClient';

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe('worldApi bounded recovery', () => {
  it('locally handled candle failures clear pending without a contradictory global notice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'internal_error' }, 500)));
    const failed = vi.fn();
    const off = onActionFailure(failed);
    expect(await worldApi.postHandled('/church/candle', { candleId: 'candle_1' })).toMatchObject({
      status: 'offline',
      unconfirmed: true,
    });
    expect(actionPending.count()).toBe(0);
    expect(failed).not.toHaveBeenCalled();
    off();
  });
  it('bounds a reconciliation read to one deadline without hidden retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(Error('aborted'))),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = worldApi.getOnce('/church?fresh=1');
    await vi.advanceTimersByTimeAsync(12001);
    expect(await result).toMatchObject({ status: 'offline', retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('retries a transient read and then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'slow' }, 429))
      .mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = worldApi.get('/journey');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ status: 'online', data: { ok: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry a domain refusal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: 'WORLD_LOCKED', message: 'no' }, 403));
    vi.stubGlobal('fetch', fetchMock);
    const result = await worldApi.get('/museum');
    expect(result).toMatchObject({ status: 'offline', code: 'WORLD_LOCKED', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a write that times out is reported unconfirmed, is not re-sent, and clears pending', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const failures: unknown[] = [];
    const off = onActionFailure((f) => failures.push(f));
    const pending = worldApi.post('/journey/ack', { interactionId: 'cottage_enter' });
    expect(actionPending.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(WORLD_POST_TIMEOUT_MS + 100);
    expect(await pending).toMatchObject({ status: 'offline', unconfirmed: true, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failures).toHaveLength(1);
    expect(actionPending.count()).toBe(0);
    off();
    vi.useRealTimers();
  });

  it('identical in-flight writes share one request (no duplicate submission)', async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal('fetch', fetchMock);
    const a = worldApi.post('/cafe/gramophone', {});
    const b = worldApi.post('/cafe/gramophone', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(json({ ok: true }));
    expect(await a).toEqual(await b);
  });
});
