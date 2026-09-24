import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPlayerState,
  flushPendingPlayerMutations,
  pendingPlayerMutationCount,
  postCheckpoint,
  postBeachShell,
  playerClientTuning,
} from '../src/services/playerClient';

const STATE = { ok: true as const, progress: [], keys: [], achievements: [] };

function response(body: unknown, ok = true, status = ok ? 200 : 503): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  playerClientTuning.readRetryDelaysMs = [];
});

describe('playerClient local cache', () => {
  it('returns only the same user cache when an authoritative read is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(STATE)));
    expect((await fetchPlayerState('owner_a')).status).toBe('online');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await fetchPlayerState('owner_a')).status).toBe('cached');
    expect((await fetchPlayerState('owner_b')).status).toBe('offline');
  });
});

describe('playerClient pending mutation queue', () => {
  it('queues a failed checkpoint and replaces an older pending checkpoint for the same route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await postCheckpoint(
      { routeId: 'first_opening', beatId: 'gate_success', checkpoint: true },
      'owner_a',
    );
    await postCheckpoint(
      { routeId: 'first_opening', beatId: 'cove_arrival', checkpoint: true },
      'owner_a',
    );
    expect(pendingPlayerMutationCount('owner_a')).toBe(1);
  });

  it('does not queue a non-retryable 400 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ ok: false, message: 'bad request' }, false, 400)),
    );
    await postCheckpoint({ routeId: 'first_opening', beatId: 'bad', checkpoint: true }, 'owner_a');
    expect(pendingPlayerMutationCount('owner_a')).toBe(0);
  });

  it('queues a transient 429 response for later reconciliation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ ok: false, message: 'quota' }, false, 429)),
    );
    await postBeachShell('owner_a');
    expect(pendingPlayerMutationCount('owner_a')).toBe(1);
  });

  it('queues the shell claim and flushes it exactly once after reconnect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await postBeachShell('owner_a');
    expect(pendingPlayerMutationCount('owner_a')).toBe(1);

    const onlineFetch = vi
      .fn()
      .mockResolvedValue(
        response({ ok: true, applied: true, reason: 'created', key: { keyTypeId: 'key_shell' } }),
      );
    vi.stubGlobal('fetch', onlineFetch);
    expect(await flushPendingPlayerMutations('owner_a')).toBe(1);
    expect(pendingPlayerMutationCount('owner_a')).toBe(0);
    expect(onlineFetch).toHaveBeenCalledTimes(1);
    expect(onlineFetch.mock.calls[0]![0]).toBe('/api/world/beach/shell');
    // The request carries no key id, quantity or transaction id for the server to trust.
    expect(JSON.parse(String(onlineFetch.mock.calls[0]![1]!.body))).toEqual({});
  });

  it('flushes pending writes before the next authoritative state read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await postCheckpoint(
      { routeId: 'first_opening', beatId: 'cove_arrival', checkpoint: true },
      'owner_a',
    );

    const onlineFetch = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true, applied: true, reason: 'applied' }))
      .mockResolvedValueOnce(response(STATE));
    vi.stubGlobal('fetch', onlineFetch);
    const result = await fetchPlayerState('owner_a');
    expect(result.status).toBe('online');
    expect(onlineFetch).toHaveBeenNthCalledWith(
      1,
      '/api/player/checkpoint',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onlineFetch).toHaveBeenNthCalledWith(2, '/api/player/state', expect.anything());
    expect(pendingPlayerMutationCount('owner_a')).toBe(0);
  });
});

describe('playerClient bounded recovery', () => {
  it('retries a transient 503 read and recovers without reporting a new player', async () => {
    playerClientTuning.readRetryDelaysMs = [0, 0];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false, 429))
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response(STATE));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchPlayerState('owner_a')).status).toBe('online');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the bounded attempts and reports offline, never an empty player', async () => {
    playerClientTuning.readRetryDelaysMs = [0, 0];
    const fetchMock = vi.fn().mockResolvedValue(response({}, false, 503));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchPlayerState('owner_x');
    expect(result.status).toBe('offline');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry an authentication failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}, false, 401));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchPlayerState('owner_x')).status).toBe('offline');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a hung read at its deadline', async () => {
    vi.useFakeTimers();
    try {
      playerClientTuning.readRetryDelaysMs = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        ),
      );
      const pending = fetchPlayerState('owner_x');
      await vi.advanceTimersByTimeAsync(12_500);
      const result = await pending;
      expect(result.status).toBe('offline');
      expect(result).toMatchObject({ message: 'The request timed out' });
    } finally {
      vi.useRealTimers();
    }
  });
});
