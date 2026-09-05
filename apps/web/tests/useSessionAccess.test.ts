import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSessionAccess } from '../src/hooks/useSessionAccess';
import { installMockFetch, SAMPLE_OWNER_SESSION } from './helpers/mockApi';

describe('useSessionAccess', () => {
  it('resolves to unauthenticated when no session cookie exists', async () => {
    installMockFetch();
    const { result } = renderHook(() => useSessionAccess('owner'));

    expect(result.current.status).toBe('resolving');
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.session).toBeNull();
  });

  it('resolves to authenticated when a valid session cookie exists', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const { result } = renderHook(() => useSessionAccess('owner'));

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.session).toEqual(SAMPLE_OWNER_SESSION);
  });

  it('markAuthenticated transitions immediately without a second round-trip', async () => {
    installMockFetch();
    const { result } = renderHook(() => useSessionAccess('owner'));
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    act(() => {
      result.current.markAuthenticated(SAMPLE_OWNER_SESSION);
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.session).toEqual(SAMPLE_OWNER_SESSION);
  });

  it('logout clears the session and returns to unauthenticated', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const { result } = renderHook(() => useSessionAccess('owner'));
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.session).toBeNull();
  });

  it('reports offline when the backend is unreachable on resume', async () => {
    installMockFetch();
    globalThis.fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    const { result } = renderHook(() => useSessionAccess('owner'));
    await waitFor(() => expect(result.current.status).toBe('offline'));
  });
});
