import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstOpeningFlow } from '../src/features/first-opening/FirstOpeningFlow';
import { playerClientTuning } from '../src/services/playerClient';
import { withCompanionName } from '../src/features/world/worldText';
import { installMockFetch } from './helpers/mockApi';

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  playerClientTuning.readRetryDelaysMs = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('a failed player-state read is never a new player', () => {
  it('shows an explicit retry (no doors, no Beach arrival, no checkpoint write) when the read fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.startsWith('/api/player/state')) return json({ message: 'quota' }, 429);
        return json({ ok: true });
      }),
    );
    render(<FirstOpeningFlow justAuthenticated={true} userId="fresh_owner" />);
    expect(await screen.findByTestId('first-opening-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('doors-opening-transition')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beach-arrival')).not.toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('recovers when Retry succeeds and resumes from the saved checkpoint, not from the start', async () => {
    let fail = true;
    const saved = {
      ok: true,
      progress: [
        {
          userId: 'u',
          routeId: 'first_opening',
          status: 'in_progress',
          currentBeatId: 'cove_arrival',
          lastCheckpointId: 'cove_arrival',
          currentLocation: 'beach',
          startedAt: '',
          completedAt: '',
          updatedAt: '',
        },
      ],
      keys: [],
      achievements: [],
    };
    installMockFetch({ ownerSession: 'authenticated', playerStateResult: saved });
    const base = globalThis.fetch as unknown as (
      i: RequestInfo | URL,
      n?: RequestInit,
    ) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        fail && String(input).startsWith('/api/player/state')
          ? json({ message: 'down' }, 503)
          : base(input, init),
      ),
    );
    render(<FirstOpeningFlow justAuthenticated={true} userId="owner_retry" />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('first-opening-retry'));
    fail = false;
    // (the first click already re-read while failing; click again once the service is back)
    await waitFor(async () => {
      if (screen.queryByTestId('first-opening-retry'))
        await user.click(screen.getByTestId('first-opening-retry'));
      expect(screen.queryByTestId('naming-prompt')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('doors-opening-transition')).not.toBeInTheDocument();
  });
});

describe('the companion is shown by the name the player chose', () => {
  it('replaces the standalone internal name, never a longer word, with the chosen or a neutral name', () => {
    expect(withCompanionName('VAR hands you the Walkman.', 'Luna', 'en')).toBe(
      'Luna hands you the Walkman.',
    );
    expect(withCompanionName('VAR’s place', 'Luna', 'en')).toBe('Luna’s place');
    expect(withCompanionName('Welcome to VARcade', 'Luna', 'en')).toBe('Welcome to VARcade');
    expect(withCompanionName('VAR: take your time', null, 'en')).toBe(
      'your companion: take your time',
    );
    expect(withCompanionName('VAR بتديكي الووكمان.', null, 'ar-EG')).toContain('رفيقك');
    expect(withCompanionName('No name here', 'Luna', 'fr')).toBe('No name here');
  });
});
