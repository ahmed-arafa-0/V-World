import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstOpeningFlow } from '../src/features/first-opening/FirstOpeningFlow';
import { installMockFetch } from './helpers/mockApi';

describe('FirstOpeningFlow — fresh success this session', () => {
  it('shows the doors-opening transition first when justAuthenticated is true and no prior record exists', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<FirstOpeningFlow justAuthenticated={true} userId="fixture_owner" />);
    expect(await screen.findByTestId('doors-opening-transition')).toBeInTheDocument();
  });

  it('proceeds doors → Beach arrival → naming/collar → Beach exploration', async () => {
    const playerStateResult = {
      ok: true,
      progress: [],
      keys: [],
      achievements: [],
    };
    installMockFetch({ ownerSession: 'authenticated', playerStateResult });
    render(<FirstOpeningFlow justAuthenticated={true} userId="fixture_owner" />);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('doors-opening-continue'));
    await screen.findByTestId('beach-arrival');
    await user.click(screen.getByTestId('beach-arrival-continue'));
    await screen.findByTestId('naming-prompt');

    await user.type(screen.getByTestId('naming-name-input'), 'Luna');
    await user.click(screen.getByTestId('naming-gender-female'));
    await user.click(screen.getByTestId('naming-submit'));
    await user.click(await screen.findByTestId('naming-continue'));

    await screen.findByTestId('scene-journey');
    expect(await screen.findByTestId('scene-stage-beach_focus')).toBeInTheDocument();
  });
});

describe('FirstOpeningFlow — resumed session (not a fresh submission)', () => {
  it('skips the doors transition and resumes at Beach arrival when there is no prior record', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<FirstOpeningFlow justAuthenticated={false} userId="fixture_owner" />);
    expect(await screen.findByTestId('beach-arrival')).toBeInTheDocument();
    expect(screen.queryByTestId('doors-opening-transition')).not.toBeInTheDocument();
  });

  it('resumes directly at Beach arrival when the checkpoint says gate_success', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerStateResult: {
        ok: true,
        progress: [
          {
            userId: 'u',
            routeId: 'first_opening',
            status: 'in_progress',
            currentBeatId: 'gate_success',
            lastCheckpointId: 'gate_success',
            currentLocation: '',
            startedAt: '',
            completedAt: '',
            updatedAt: '',
          },
        ],
        keys: [],
        achievements: [],
      },
    });
    render(<FirstOpeningFlow justAuthenticated={false} userId="fixture_owner" />);
    expect(await screen.findByTestId('beach-arrival')).toBeInTheDocument();
  });

  it('resumes at naming when the Cove arrival checkpoint is already saved', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerStateResult: {
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
      },
    });
    render(<FirstOpeningFlow justAuthenticated={false} userId="fixture_owner" />);
    expect(await screen.findByTestId('naming-prompt')).toBeInTheDocument();
  });

  it('resumes directly at the Beach (SceneJourney) when the checkpoint says naming_complete', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerStateResult: {
        ok: true,
        progress: [
          {
            userId: 'u',
            routeId: 'first_opening',
            status: 'in_progress',
            currentBeatId: 'naming_complete',
            lastCheckpointId: 'naming_complete',
            currentLocation: '',
            startedAt: '',
            completedAt: '',
            updatedAt: '',
          },
        ],
        keys: [],
        achievements: [],
      },
    });
    render(<FirstOpeningFlow justAuthenticated={false} userId="fixture_owner" />);
    expect(await screen.findByTestId('scene-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('naming-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doors-opening-transition')).not.toBeInTheDocument();
  });

  it('asks the server to claim the Beach shell (no client-chosen key) when the marker is activated', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerStateResult: {
        ok: true,
        progress: [
          {
            userId: 'u',
            routeId: 'first_opening',
            status: 'in_progress',
            currentBeatId: 'naming_complete',
            lastCheckpointId: 'naming_complete',
            currentLocation: 'beach',
            startedAt: '',
            completedAt: '',
            updatedAt: '',
          },
        ],
        keys: [],
        achievements: [],
      },
    });
    render(<FirstOpeningFlow justAuthenticated={false} userId="fixture_owner" />);
    await screen.findByTestId('scene-stage-beach_focus');
    await userEvent.setup().click(screen.getByTestId('marker-shell'));
    expect(screen.queryByTestId('marker-activated-note')).not.toBeInTheDocument();
    const awardCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).startsWith('/api/world/beach/shell'));
    expect(awardCall).toBeDefined();
    expect(JSON.parse(String(awardCall![1]!.body))).toEqual({});
  });
});
