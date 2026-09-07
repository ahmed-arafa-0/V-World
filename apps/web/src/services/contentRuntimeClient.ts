import type { ContentRuntimeResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type ContentRuntimeResult = ApiFetchResult<ContentRuntimeResponse>;

export function fetchContentRuntime(options?: {
  refresh?: boolean;
}): Promise<ContentRuntimeResult> {
  const url = options?.refresh ? '/api/content/runtime?refresh=1' : '/api/content/runtime';
  return fetchJson<ContentRuntimeResponse>(url);
}
