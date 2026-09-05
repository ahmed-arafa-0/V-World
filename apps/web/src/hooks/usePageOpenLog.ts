import { useEffect, useRef } from 'react';
import { pageOpen } from '../services/accessClient';
import { getOrCreateDeviceId } from '../services/deviceId';
import { generateClientId } from '../services/clientIds';

/**
 * Logs one `page_open` event per actual browser page load — mounted once at
 * the app root (not per route), so navigating between client-side routes
 * never sends a second one, only a fresh full navigation/reload does. The
 * operation ID is generated once and reused for the lifetime of this
 * mount, so if this ever runs twice (e.g. a dev double-invoke), the
 * backend's idempotency guard collapses it into a single log row.
 */
export function usePageOpenLog(): void {
  const sentRef = useRef(false);
  const operationIdRef = useRef<string | null>(null);
  if (operationIdRef.current === null) {
    operationIdRef.current = generateClientId();
  }

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    void pageOpen({
      operationId: operationIdRef.current!,
      deviceId: getOrCreateDeviceId(),
      route: window.location.pathname,
      language: navigator.language,
    });
  }, []);
}
