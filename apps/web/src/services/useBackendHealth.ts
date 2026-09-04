import { useEffect, useState } from 'react';
import { fetchBackendHealth, type HealthCheckResult } from './healthClient';

export function useBackendHealth(): HealthCheckResult {
  const [result, setResult] = useState<HealthCheckResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchBackendHealth().then((next) => {
      if (!cancelled) {
        setResult(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
