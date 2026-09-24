import type { ContentRuntimeResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type ContentRuntimeResult = ApiFetchResult<ContentRuntimeResponse>;

/**
 * Several parts of one page load (Beach, naming, world, scene) all want the same runtime content.
 * Concurrent callers share one request, and a successful answer is reused briefly, so a page load
 * costs one content read instead of four. Content only; per-player state is never memoised here.
 */
const REUSE_MS = 15_000;
let shared: { at: number; promise: Promise<ContentRuntimeResult> } | null = null;

export function resetContentRuntimeCache(): void {
  shared = null;
}

export function fetchContentRuntime(options?: {
  refresh?: boolean;
}): Promise<ContentRuntimeResult> {
  if (options?.refresh) {
    shared = null;
    return fetchJson<ContentRuntimeResponse>('/api/content/runtime?refresh=1');
  }
  if (shared && Date.now() - shared.at < REUSE_MS) return shared.promise;
  const entry = {
    at: Date.now(),
    promise: fetchJson<ContentRuntimeResponse>('/api/content/runtime'),
  };
  shared = entry;
  void entry.promise.then((result) => {
    if (result.status !== 'online' && shared === entry) shared = null;
  });
  return entry.promise;
}
