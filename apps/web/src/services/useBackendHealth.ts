import { useCallback } from 'react';
import { fetchBackendHealth, type HealthCheckResult } from './healthClient';
import { useApiResource } from './useApiResource';

export function useBackendHealth(): HealthCheckResult {
  const fetcher = useCallback(() => fetchBackendHealth(), []);
  const { state } = useApiResource(fetcher);
  return state;
}
