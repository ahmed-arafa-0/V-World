import type { BootstrapResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type BootstrapResult = ApiFetchResult<BootstrapResponse>;

export function fetchBootstrap(options?: { refresh?: boolean }): Promise<BootstrapResult> {
  const url = options?.refresh ? '/api/bootstrap?refresh=1' : '/api/bootstrap';
  return fetchJson<BootstrapResponse>(url);
}
