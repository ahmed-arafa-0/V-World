import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBackendHealth } from '../src/services/healthClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBackendHealth', () => {
  it('returns online with parsed data when the backend responds ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, milestone: 'M00' }),
      }),
    );

    const result = await fetchBackendHealth();
    expect(result.status).toBe('online');
  });

  it('returns offline when the backend responds with a non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await fetchBackendHealth();
    expect(result.status).toBe('offline');
  });

  it('returns offline when the request throws (backend unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await fetchBackendHealth();
    expect(result.status).toBe('offline');
  });
});
