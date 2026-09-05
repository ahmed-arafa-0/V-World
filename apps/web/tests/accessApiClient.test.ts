import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteJson, getJson, isNetworkFailure, postJson } from '../src/services/accessApiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postJson / getJson / deleteJson', () => {
  it('sends the given method, JSON body, and same-origin credentials', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchSpy);

    await postJson('/api/auth/gate', { digits: ['1', '2', '3', '4'] });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/gate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digits: ['1', '2', '3', '4'] }),
      }),
    );
  });

  it('getJson sends no body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchSpy);

    await getJson('/api/session/owner');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/session/owner',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    expect(fetchSpy.mock.calls[0]![1]!.body).toBeUndefined();
  });

  it('deleteJson uses the DELETE method', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchSpy);

    await deleteJson('/api/session/owner');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/session/owner',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('returns the parsed JSON body as-is on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, logId: 'log_1' }) }),
    );

    const result = await postJson('/api/access/page-open', { operationId: 'op_1' });
    expect(result).toEqual({ ok: true, logId: 'log_1' });
  });

  it('returns a NETWORK_ERROR result when fetch throws, without leaking internal error detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('DNS resolution failed for host xyz')),
    );

    const result = await postJson('/api/auth/gate', {});
    expect(isNetworkFailure(result)).toBe(true);
    if (isNetworkFailure(result)) {
      expect(result.message).not.toContain('DNS');
      expect(result.message).not.toContain('xyz');
    }
  });

  it('returns a NETWORK_ERROR result when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );

    const result = await getJson('/api/session/owner');
    expect(isNetworkFailure(result)).toBe(true);
  });
});

describe('isNetworkFailure', () => {
  it('distinguishes a network failure from a normal ok:false backend response', () => {
    expect(isNetworkFailure({ ok: false, code: 'NETWORK_ERROR', message: 'x' })).toBe(true);
    expect(isNetworkFailure({ ok: false, code: 'INVALID_GATE_CODE', message: 'x' })).toBe(false);
    expect(isNetworkFailure({ ok: true, logId: 'log_1' })).toBe(false);
  });
});
