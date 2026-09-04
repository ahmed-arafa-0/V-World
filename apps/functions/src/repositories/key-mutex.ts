/** Serializes async operations that share the same key, so concurrent writes to the same tab/row don't race. */
export class KeyMutex {
  private chains = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    this.chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }
}
