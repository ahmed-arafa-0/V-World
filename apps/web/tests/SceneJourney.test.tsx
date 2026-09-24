import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneJourney } from '../src/features/scene-engine/SceneJourney';
import { installMockFetch, SAMPLE_CONTENT_RUNTIME_RESPONSE } from './helpers/mockApi';
import { WorldRuntimeExtensions } from '../src/features/scene-engine/runtimeExtensions';

function renderJourney(options: Parameters<typeof installMockFetch>[0] = {}) {
  installMockFetch({ ownerSession: 'authenticated', ...options });
  return render(<SceneJourney stepDelayMs={0} forceDebugOverlay={false} />);
}

describe('SceneJourney — resume behavior', () => {
  it('starts at the first node when there is no prior checkpoint', async () => {
    renderJourney();
    const stage = await screen.findByTestId('scene-stage-beach_focus');
    expect(stage).toBeInTheDocument();
  });

  it("resolves a node's real background photo against 10_ASSETS once registered/enabled", async () => {
    renderJourney({
      contentRuntimeResult: {
        ...SAMPLE_CONTENT_RUNTIME_RESPONSE,
        assets: [
          ...SAMPLE_CONTENT_RUNTIME_RESPONSE.assets,
          {
            assetId: 'beach_focus_scene',
            assetType: 'image',
            version: 1,
            preloadPriority: 1,
            hasMobileVariant: false,
            hasPosterVariant: false,
            mediaRef: '/api/media/beach_focus_scene?v=1',
          },
        ],
      },
    });
    const photo = await screen.findByTestId('scene-photo-beach_focus');
    expect(photo).toHaveAttribute('src', '/api/media/beach_focus_scene?v=1');
  });

  it('renders the walking companion (collared, since naming is already complete by this point) once var_walk_collar is registered/enabled', async () => {
    renderJourney({
      contentRuntimeResult: {
        ...SAMPLE_CONTENT_RUNTIME_RESPONSE,
        assets: [
          ...SAMPLE_CONTENT_RUNTIME_RESPONSE.assets,
          {
            assetId: 'var_walk_collar',
            assetType: 'image',
            version: 1,
            preloadPriority: 3,
            hasMobileVariant: false,
            hasPosterVariant: false,
            mediaRef: '/api/media/var_walk_collar?v=1',
          },
        ],
      },
    });
    const companion = await screen.findByTestId('scene-companion');
    expect(companion).toHaveAttribute('src', '/api/media/var_walk_collar?v=1');
  });

  it('renders no companion overlay when var_walk_collar is not registered yet (default)', async () => {
    renderJourney();
    await screen.findByTestId('scene-stage-beach_focus');
    expect(screen.queryByTestId('scene-companion')).not.toBeInTheDocument();
  });

  it('resumes at the last-checkpointed node instead of restarting (interrupted-journey safety)', async () => {
    renderJourney({
      playerStateResult: {
        ok: true,
        progress: [
          {
            userId: 'u',
            routeId: 'm05_prototype',
            status: 'in_progress',
            currentBeatId: 'steps_church_approach',
            lastCheckpointId: 'steps_church_approach',
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

    const stage = await screen.findByTestId('scene-stage-steps_church_approach');
    expect(stage).toBeInTheDocument();
    expect(screen.queryByTestId('scene-stage-beach_focus')).not.toBeInTheDocument();
  });

  it('falls back to the first node when the recorded beat id no longer exists in this journey', async () => {
    renderJourney({
      playerStateResult: {
        ok: true,
        progress: [
          {
            userId: 'u',
            routeId: 'm05_prototype',
            status: 'in_progress',
            currentBeatId: 'a_beat_that_was_removed',
            lastCheckpointId: '',
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

    expect(await screen.findByTestId('scene-stage-beach_focus')).toBeInTheDocument();
  });
});

describe('SceneJourney — in-scene travel', () => {
  it('walks the authored chain, blocks repeated input during fades, and checkpoints each step once', async () => {
    renderJourney();
    await screen.findByTestId('scene-stage-beach_focus');
    expect(screen.queryByTestId('walk-back')).not.toBeInTheDocument();
    const user = userEvent.setup();
    for (const node of ['beach_steps', 'steps_church_approach', 'church_focus']) {
      await waitFor(() => expect(screen.getByTestId('walk-forward')).toBeEnabled());
      await user.click(screen.getByTestId('walk-forward'));
      expect(await screen.findByTestId(`scene-stage-${node}`)).toBeInTheDocument();
      expect(screen.getByTestId('walk-back')).toBeDisabled();
    }
    expect(screen.queryByTestId('walk-forward')).not.toBeInTheDocument();
  });
  it('preserves shell interactions without displaying developer result strings', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const activate = vi.fn().mockResolvedValue('internal result');
    render(<SceneJourney onMarkerActivate={activate} />);
    await userEvent.setup().click(await screen.findByTestId('marker-shell'));
    expect(activate).toHaveBeenCalledWith('shell', 'beach', 'beach_focus');
    expect(screen.queryByText(/internal result|Interacted with/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('scene-debug-overlay')).not.toBeInTheDocument();
  });
  it('keeps keyboard look bounded and resets it after travel', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<SceneJourney forceDebugOverlay stepDelayMs={0} />);
    (await screen.findByTestId('scene-journey')).focus();
    await userEvent.setup().keyboard('{ArrowRight>10/}');
    expect(screen.getByTestId('debug-pan')).toHaveTextContent('20.0');
    await userEvent.setup().click(screen.getByTestId('walk-forward'));
    await screen.findByTestId('scene-stage-beach_steps');
    expect(screen.getByTestId('debug-pan')).toHaveTextContent('0.0');
  });
});

describe('SceneJourney — Phase 1 extension seams', () => {
  it('applies a registered location audio policy and renders an active event overlay', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const extensions = new WorldRuntimeExtensions();
    extensions.registerLocation('beach', {
      resolveAudioPolicy: () => ({
        backgroundMusic: 'stop',
        songStart: 'interaction-only',
        gameMusic: 'disabled',
        walkmanGain: 0.4,
        soundEffects: 'allowed',
      }),
    });
    extensions.registerEventOverlay({
      id: 'fixture_event',
      priority: 1,
      isActive: ({ locationId }) => locationId === 'beach',
      render: () => <span>Fixture overlay</span>,
    });
    render(<SceneJourney stepDelayMs={0} forceDebugOverlay={false} extensions={extensions} />);
    const root = await screen.findByTestId('scene-journey');
    await vi.waitFor(() => expect(root).toHaveAttribute('data-background-music', 'stop'));
    expect(root).toHaveAttribute('data-song-start', 'interaction-only');
    expect(root).toHaveAttribute('data-game-music', 'disabled');
    expect(root).toHaveAttribute('data-walkman-gain', '0.4');
    expect(screen.getByTestId('event-overlay-fixture_event')).toHaveTextContent('Fixture overlay');
  });
});

describe('SceneJourney — debug overlay', () => {
  it('is hidden when forceDebugOverlay is false', async () => {
    renderJourney();
    await screen.findByTestId('scene-stage-beach_focus');
    expect(screen.queryByTestId('scene-debug-overlay')).not.toBeInTheDocument();
  });

  it('shows the current node id and pan when forced on', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    render(<SceneJourney stepDelayMs={0} forceDebugOverlay={true} />);
    await screen.findByTestId('scene-stage-beach_focus');
    expect(screen.getByTestId('debug-node-id')).toHaveTextContent('beach_focus');
    expect(screen.getByTestId('debug-pan')).toHaveTextContent('0.0');
  });
});
