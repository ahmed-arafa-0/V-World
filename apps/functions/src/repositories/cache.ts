interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface GetOrLoadOptions {
  bypass?: boolean;
}

/**
 * Small in-memory TTL cache. Concurrent calls for the same key while a load
 * is in flight share the one pending promise instead of issuing duplicate
 * Google API requests, whether or not the caller asked to bypass the cache.
 */
export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private pending = new Map<string, Promise<unknown>>();
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = Math.max(0, ttlSeconds) * 1000;
  }

  setTtlSeconds(ttlSeconds: number): void {
    this.ttlMs = Math.max(0, ttlSeconds) * 1000;
  }

  get size(): number {
    return this.store.size;
  }

  get ttlSeconds(): number {
    return this.ttlMs / 1000;
  }

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    options?: GetOrLoadOptions,
  ): Promise<T> {
    if (!options?.bypass) {
      const cached = this.store.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as T;
      }
    }

    const existingPending = this.pending.get(key);
    if (existingPending) {
      return existingPending as Promise<T>;
    }

    const promise = loader()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        this.pending.delete(key);
        return value;
      })
      .catch((err: unknown) => {
        this.pending.delete(key);
        throw err;
      });

    this.pending.set(key, promise);
    return promise;
  }

  peek<T>(key: string): T | undefined {
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    return undefined;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.pending.clear();
  }
}
