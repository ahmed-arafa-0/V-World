import type { PreGateContentResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export function fetchPreGateContent(): Promise<ApiFetchResult<PreGateContentResponse>> {
  return fetchJson<PreGateContentResponse>('/api/content/pre-gate');
}
