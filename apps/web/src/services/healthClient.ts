import type { HealthResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type HealthCheckResult = ApiFetchResult<HealthResponse>;

export function fetchBackendHealth(): Promise<HealthCheckResult> {
  return fetchJson<HealthResponse>('/api/health');
}
