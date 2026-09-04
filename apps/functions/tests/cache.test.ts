import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/repositories/cache.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TtlCache', () => {
  it('serves a cached value without calling the loader again within the TTL', async () => {
    const cache = new TtlCache(60);
    const loader = vi.fn().mockResolvedValue('value');

    await cache.getOrLoad('key', loader);
    await cache.getOrLoad('key', loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after the TTL expires', async () => {
    const cache = new TtlCache(0.05); // 50ms
    const loader = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    const first = await cache.getOrLoad('key', loader);
    await sleep(80);
    const second = await cache.getOrLoad('key', loader);

    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache when requested, and refreshes the cached value', async () => {
    const cache = new TtlCache(60);
    const loader = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await cache.getOrLoad('key', loader);
    const bypassed = await cache.getOrLoad('key', loader, { bypass: true });
    const cachedAfterBypass = await cache.getOrLoad('key', loader);

    expect(bypassed).toBe('second');
    expect(cachedAfterBypass).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent identical requests into a single loader call', async () => {
    const cache = new TtlCache(60);
    let resolveLoader!: (value: string) => void;
    const loader = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const p1 = cache.getOrLoad('key', loader);
    const p2 = cache.getOrLoad('key', loader);
    resolveLoader('shared-value');

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('shared-value');
    expect(r2).toBe('shared-value');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces the next read to reload', async () => {
    const cache = new TtlCache(60);
    const loader = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await cache.getOrLoad('key', loader);
    cache.invalidate('key');
    const result = await cache.getOrLoad('key', loader);

    expect(result).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected load, so the next call retries', async () => {
    const cache = new TtlCache(60);
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    await expect(cache.getOrLoad('key', loader)).rejects.toThrow('boom');
    const result = await cache.getOrLoad('key', loader);

    expect(result).toBe('recovered');
  });
});
