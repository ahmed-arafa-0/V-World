import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';
import { MuseumHall } from '../src/features/world/views/MuseumView';
import { ArcadeView } from '../src/features/world/views/ArcadeView';
import { FarmView } from '../src/features/world/views/FarmView';
import { CottageView } from '../src/features/world/views/CottageView';
import { worldText } from '../src/features/world/worldText';
import { worldApi } from '../src/features/world/worldClient';
import { useLocaleStore } from '../src/i18n/localeStore';

vi.mock('../src/features/world/worldClient', async (orig) => {
  const actual = await orig<typeof import('../src/features/world/worldClient')>();
  return { ...actual, worldApi: { get: vi.fn(), post: vi.fn(), postIdempotent: vi.fn() } };
});
const api = vi.mocked(worldApi);
const online = (data: unknown) => Promise.resolve({ status: 'online' as const, data }) as never;
const offline = () =>
  Promise.resolve({ status: 'offline' as const, message: 'x', retryable: true }) as never;

afterEach(() => useLocaleStore.setState({ locale: 'en' }));
beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockImplementation(() => online({}));
});

function World({
  children,
  uiText = [],
  locale = 'en',
}: {
  children: ReactNode;
  uiText?: unknown[];
  locale?: 'en' | 'ar-EG';
}) {
  const env = {
    userId: 'u',
    locale,
    icons: [],
    assets: [],
    uiText,
    dialogue: [],
    journey: {
      accessibleLocations: [],
      currentBeat: null,
      phase: 'free',
      keys: [],
      beats: [],
    },
    walkman: { duck: vi.fn(), playing: false, silenced: false },
    t: (key: Parameters<typeof worldText>[0]) => worldText(key, locale),
    assetRef: () => null,
    notify: vi.fn(),
    showRewards: vi.fn(),
    refreshJourney: vi.fn().mockResolvedValue(null),
    applyJourney: vi.fn(),
  } as unknown as WorldEnv;
  return <WorldEnvProvider value={env}>{children}</WorldEnvProvider>;
}

const exhibit = (over: Record<string, unknown>) => ({
  exhibitId: 'e1',
  wingId: 'archive_wing',
  positionId: 'pos_1',
  exhibitType: 'image',
  displayNameTextId: 'exhibit_comic_name',
  locked: false,
  secret: false,
  imageRefs: [],
  audioRef: null,
  pdfRef: null,
  archiveUrl: null,
  bookPage: 0,
  ...over,
});
const museum = (wings: unknown[]) => ({
  ok: true,
  entrance: { open: true, requirement: [], puzzleRequired: false, puzzleSolved: true },
  hall: { artifactViewed: true, progress: [] },
  wings,
});

describe('Museum labels and closed states', () => {
  it('never shows raw content ids: a missing label becomes a localized generic word', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() =>
      online(museum([{ wingId: 'archive_wing', locked: false, exhibits: [exhibit({})] }])),
    );
    const view = render(
      <World>
        <MuseumHall onLeave={() => undefined} onMap={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('hall-wings'));
    const panel = await screen.findByTestId('hall-wings-panel');
    expect(panel.textContent).not.toMatch(/archive_wing|exhibit_comic_name|pos_1/);
    expect(panel).toHaveTextContent('Wing 1');
    expect(screen.getByTestId('exhibit-open-e1')).toHaveTextContent('Exhibit 1');
    view.unmount();
  });

  it('uses the Sheet label when it exists, and shows one closed message per closed wing', async () => {
    const user = userEvent.setup();
    const uiText = [
      {
        textId: 'exhibit_comic_name',
        locale: 'en',
        text: 'The Comic',
        direction: 'ltr',
      },
    ];
    api.get.mockImplementation(() =>
      online(
        museum([
          { wingId: 'archive_wing', locked: false, exhibits: [exhibit({})] },
          {
            wingId: 'closed_wing',
            locked: true,
            exhibits: [
              exhibit({ exhibitId: 'x1', locked: true }),
              exhibit({ exhibitId: 'x2', locked: true }),
            ],
          },
        ]),
      ),
    );
    render(
      <World uiText={uiText}>
        <MuseumHall onLeave={() => undefined} onMap={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('hall-wings'));
    expect(await screen.findByTestId('exhibit-open-e1')).toHaveTextContent('The Comic');
    const closed = screen.getAllByText('This wing is still closed.');
    expect(closed).toHaveLength(1);
    expect(screen.getByTestId('hall-wings-panel').textContent).not.toMatch(/closed_wing/);
  });

  it('says a failed exhibit load failed, and retries', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() =>
      online(museum([{ wingId: 'w', locked: false, exhibits: [exhibit({ exhibitId: 'e1' })] }])),
    );
    api.post.mockImplementation(() => offline());
    render(
      <World>
        <MuseumHall onLeave={() => undefined} onMap={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('hall-wings'));
    await user.click(await screen.findByTestId('exhibit-open-e1'));
    expect(await screen.findByTestId('exhibit-load-failed')).toBeInTheDocument();
    const calls = api.post.mock.calls.length;
    api.post.mockImplementation(() => online(museum([])));
    await user.click(screen.getByTestId('exhibit-retry'));
    expect(api.post.mock.calls.length).toBeGreaterThan(calls);
  });

  it('offers an "Open original website" link for the archive exhibit, opened in a new tab without navigating away', async () => {
    const user = userEvent.setup();
    const archiveExhibit = exhibit({
      exhibitType: 'archive_portal',
      archiveUrl: 'https://varcountdown.web.app/',
    });
    api.get.mockImplementation(() =>
      online(museum([{ wingId: 'archive_wing', locked: false, exhibits: [archiveExhibit] }])),
    );
    api.post.mockImplementation(() =>
      online(museum([{ wingId: 'archive_wing', locked: false, exhibits: [archiveExhibit] }])),
    );
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const view = render(
      <World>
        <MuseumHall onLeave={() => undefined} onMap={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('hall-wings'));
    await user.click(await screen.findByTestId('exhibit-open-e1'));
    const link = await screen.findByTestId('archive-open-link');
    expect(link).toHaveTextContent('Open original website');
    await user.click(link);
    expect(openSpy).toHaveBeenCalledWith(
      'https://varcountdown.web.app/',
      '_blank',
      'noopener,noreferrer',
    );
    // The panel/game itself is still mounted — no navigation happened.
    expect(screen.getByTestId('exhibit-panel')).toBeInTheDocument();
    openSpy.mockRestore();
    view.unmount();
  });

  it('shows the "not yet opened" message for an archive exhibit with no configured link', async () => {
    const user = userEvent.setup();
    const archiveExhibit = exhibit({ exhibitType: 'archive_portal', archiveUrl: null });
    api.get.mockImplementation(() =>
      online(museum([{ wingId: 'archive_wing', locked: false, exhibits: [archiveExhibit] }])),
    );
    api.post.mockImplementation(() =>
      online(museum([{ wingId: 'archive_wing', locked: false, exhibits: [archiveExhibit] }])),
    );
    render(
      <World>
        <MuseumHall onLeave={() => undefined} onMap={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('hall-wings'));
    await user.click(await screen.findByTestId('exhibit-open-e1'));
    expect(await screen.findByTestId('archive-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('archive-open-link')).not.toBeInTheDocument();
  });
});

describe('Arcade cabinet screens', () => {
  const game = (n: number, over: Record<string, unknown> = {}) => ({
    gameId: `g${n}`,
    cabinetSlot: n,
    family: 'memory',
    displayNameTextId: `game_${n}_name`,
    installed: true,
    unlocked: true,
    keyCost: { keyTypeId: 'key_token', quantity: 2 },
    canAfford: false,
    walkmanVolumePercent: 40,
    sfxEnabled: true,
    musicEnabled: false,
    difficulty: 1,
    scoreMode: 'score',
    personalBest: null,
    attempts: 0,
    recent: [],
    ...over,
  });

  it('shows the localized game name and a clear state on each cabinet, and explains a locked one', async () => {
    const user = userEvent.setup();
    const uiText = [
      { textId: 'game_1_name', locale: 'en', text: 'Memory Match', direction: 'ltr' },
      { textId: 'game_2_name', locale: 'en', text: 'Slide Puzzle', direction: 'ltr' },
    ];
    api.postIdempotent.mockImplementation(() =>
      online({
        ok: true,
        supportedSlots: 5,
        tokens: 0,
        games: [game(1), game(2, { unlocked: false })],
      }),
    );
    render(
      <World uiText={uiText}>
        <ArcadeView onLeave={() => undefined} />
      </World>,
    );
    expect(await screen.findByTestId('cabinet-name-1')).toHaveTextContent('Memory Match');
    expect(screen.getByTestId('cabinet-state-1')).toHaveTextContent('Play');
    expect(screen.getByTestId('cabinet-name-2')).toHaveTextContent('Slide Puzzle');
    expect(screen.getByTestId('cabinet-state-2')).toHaveTextContent('Locked · costs 2');
    expect(screen.getByTestId('cabinet-3')).toHaveTextContent('Empty cabinet');
    await user.click(screen.getByTestId('cabinet-2'));
    expect(screen.getByTestId('arcade-not-enough')).toBeInTheDocument();
    expect(screen.getByTestId('arcade-unlock')).toBeDisabled();
    // Server eligibility is never bypassed by the client.
    expect(api.post).not.toHaveBeenCalledWith('/arcade/unlock', expect.anything());
  });
});

describe('Farm plots', () => {
  it('names the crop and its state on a planted plot and offers planting on an empty one', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() =>
      online({
        ok: true,
        plots: [plot('plot_1', null, 'empty'), plot('plot_2', 'sunflower', 'growing')],
        crops: [{ cropId: 'sunflower', displayNameTextId: 's', seeds: 1, produce: 0 }],
        weather: 'dry',
        barn: { unlocked: false },
        marcelinoHere: false,
        harvests: 0,
      }),
    );
    render(
      <World>
        <FarmView onLeave={() => undefined} onBack={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('plot-plot_2'));
    expect(screen.getByTestId('plot-status')).toHaveTextContent('Sunflower');
    expect(screen.getByTestId('plot-status')).toHaveTextContent('Growing');
    await user.click(screen.getByTestId('plot-panel-close'));
    await user.click(screen.getByTestId('plot-plot_1'));
    expect(screen.getByTestId('plot-empty-hint')).toBeInTheDocument();
    expect(screen.getByTestId('plant-sunflower')).toBeEnabled();
  });
});

function plot(plotId: string, cropId: string | null, state: string) {
  return {
    plotId,
    cropId,
    state,
    plantedAt: '',
    nextWaterDueAt: '',
    readyAt: '',
    wiltedAt: '',
    progressPercent: 40,
    needsWater: false,
  };
}

describe('Cottage load states', () => {
  it('refreshes newly granted birthday decor when opening a slot without reloading the Cottage', async () => {
    const initial = cottage();
    api.get.mockImplementation(() => online(initial));
    api.postIdempotent.mockImplementation(() => online({ state: initial, batches: [] }));
    render(
      <World>
        <CottageView onLeave={() => undefined} />
      </World>,
    );
    await screen.findByTestId('decor-s1');
    api.get.mockImplementation(() =>
      online({ ...initial, decor: { ...initial.decor, owned: ['birthday_cottage_decoration'] } }),
    );
    await userEvent.setup().click(screen.getByTestId('decor-s1'));
    expect(
      await screen.findByTestId('decor-place-birthday_cottage_decoration'),
    ).toBeInTheDocument();
  });

  it('reports a failed mailbox load with a retry, distinct from an empty mailbox', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() => offline());
    api.postIdempotent.mockImplementation(() => offline());
    render(
      <World>
        <CottageView onLeave={() => undefined} />
      </World>,
    );
    await user.click(await screen.findByTestId('cottage-mailbox'));
    expect(await screen.findByTestId('cottage-load-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('mailbox-empty')).not.toBeInTheDocument();
    api.get.mockImplementation(() => online(cottage()));
    await user.click(screen.getByTestId('cottage-retry'));
    expect(await screen.findByTestId('mailbox-empty')).toBeInTheDocument();
  });

  it('labels the four mantel countdown fields with localized units', async () => {
    api.get.mockImplementation(() => online(cottage()));
    api.postIdempotent.mockImplementation(() => online({ state: cottage(), batches: [] }));
    render(
      <World>
        <CottageView onLeave={() => undefined} />
      </World>,
    );
    await screen.findByTestId('cottage-interior');
    // Without registered art there is no painted plane, so the panel (always available) carries the units.
    await userEvent.setup().click(await screen.findByTestId('cottage-countdown'));
    expect(await screen.findByTestId('countdown')).toHaveTextContent(
      /days.*hours.*minutes.*seconds/,
    );
  });
});

function cottage() {
  return {
    ok: true,
    serverNow: '2026-09-21T10:00:00Z',
    messages: [],
    unreadCount: 0,
    decor: { slots: ['s1', 's2', 's3', 's4'], placed: {}, owned: [] },
    produce: {},
    window: { timeOfDay: 'day', weather: 'clear' },
    marcelino: { visible: false },
    countdown: {
      targetAt: '2026-12-01T00:00:00Z',
      completed: false,
      completedDate: null,
      name: '',
    },
  };
}
