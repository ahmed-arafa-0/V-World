import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafeSessionSummary, SessionKind } from '@veoullas-world/contracts';
import { heartbeatSession, logoutSession, resumeSession } from '../services/accessClient';
import { isNetworkFailure } from '../services/accessApiClient';
import { generateClientId } from '../services/clientIds';

export type SessionAccessStatus = 'resolving' | 'authenticated' | 'unauthenticated' | 'offline';

export interface UseSessionAccessResult {
  status: SessionAccessStatus;
  session: SafeSessionSummary | null;
  /** Call once after a successful login POST — moves straight to `authenticated` without a second round-trip. */
  markAuthenticated: (session: SafeSessionSummary) => void;
  logout: () => Promise<void>;
}

/**
 * Mirrors the backend's accepted `session_heartbeat_seconds` (30). Not
 * exposed by `/api/bootstrap` (that endpoint never reads 01_APP_CONFIG's
 * access-config rows), so this is a fixed technical timing constant rather
 * than Sheet-driven editable content.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Resolves the given session kind's cookie-backed session on mount, keeps
 * it alive with a heartbeat while authenticated, and exposes `logout`.
 * Never reads or stores a session ID or cookie value itself — only the
 * safe summary the backend returns.
 */
export function useSessionAccess(kind: SessionKind): UseSessionAccessResult {
  const [status, setStatus] = useState<SessionAccessStatus>('resolving');
  const [session, setSession] = useState<SafeSessionSummary | null>(null);
  const heartbeatInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const resumeOperationId = generateClientId();

    resumeSession(kind, resumeOperationId).then((result) => {
      if (cancelled) return;
      if (isNetworkFailure(result)) {
        setStatus('offline');
        return;
      }
      if (result.ok) {
        setSession(result.session);
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;

    const interval = window.setInterval(() => {
      if (heartbeatInFlight.current) return;
      heartbeatInFlight.current = true;

      heartbeatSession(kind)
        .then((result) => {
          if (isNetworkFailure(result)) {
            // Temporary network failure is not the same as an invalid
            // session — stay authenticated and try again next tick.
            return;
          }
          if (result.ok) {
            setSession(result.session);
          } else {
            setSession(null);
            setStatus('unauthenticated');
          }
        })
        .finally(() => {
          heartbeatInFlight.current = false;
        });
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status, kind]);

  const markAuthenticated = useCallback((next: SafeSessionSummary) => {
    setSession(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutSession(kind);
    setSession(null);
    setStatus('unauthenticated');
  }, [kind]);

  return { status, session, markAuthenticated, logout };
}
