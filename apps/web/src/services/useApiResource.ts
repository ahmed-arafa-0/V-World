import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFetchResult } from './apiClient';

export interface UseApiResourceResult<T> {
  state: ApiFetchResult<T>;
  /** Re-runs the fetch. Useful for a manual "Retry" or "Refresh" control. */
  refetch: () => void;
}

/** Runs `fetcher` on mount and whenever `refetch()` is called, tracking loading/online/offline state. */
export function useApiResource<T>(
  fetcher: () => Promise<ApiFetchResult<T>>,
): UseApiResourceResult<T> {
  const [state, setState] = useState<ApiFetchResult<T>>({ status: 'loading' });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetcherRef.current().then((result) => {
      if (!cancelled) setState(result);
    });

    return () => {
      cancelled = true;
    };
  }, [generation]);

  const refetch = useCallback(() => setGeneration((g) => g + 1), []);

  return { state, refetch };
}
