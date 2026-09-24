import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { WorldEnvProvider, type WorldEnv } from '../src/features/world/WorldContext';
import { useWalkmanController } from '../src/features/world/useWalkman';
import { WalkmanDock, formatTime } from '../src/features/world/Walkman';
import { ChurchView } from '../src/features/world/views/ChurchView';
import { CafeView } from '../src/features/world/views/CafeView';
import {
  OceanView,
  OCEAN_DAYTIME_VIDEO_ID,
  randomStartSeconds,
} from '../src/features/world/OceanView';
import { YT_PLAYER_STATE } from '../src/features/world/youtubeIframeApi';
import { MAP_ANCHORS } from '../src/features/world/views/MapView';
import { worldText } from '../src/features/world/worldText';
import { worldApi } from '../src/features/world/worldClient';
import { useLocaleStore } from '../src/i18n/localeStore';

vi.mock('../src/features/world/worldClient', async (orig) => {
  const actual = await orig<typeof import('../src/features/world/worldClient')>();
  return {
    ...actual,
    worldApi: {
      get: vi.fn(),
      post: vi.fn(),
      postIdempotent: vi.fn(),
      postHandled: vi.fn(),
      getOnce: vi.fn(),
    },
  };
});
const api = vi.mocked(worldApi);

const loadYouTubeIframeApi = vi.fn();
vi.mock('../src/features/world/youtubeIframeApi', async (orig) => {
  const actual = await orig<typeof import('../src/features/world/youtubeIframeApi')>();
  return { ...actual, loadYouTubeIframeApi: () => loadYouTubeIframeApi() };
});

/** A fake `window.YT` capturing every player instance this test creates, never touching the network. */
function createFakeYT() {
  const instances: FakePlayer[] = [];
  class FakePlayer {
    destroy = vi.fn();
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    seekTo = vi.fn();
    getDuration = vi.fn(() => 60);
    getPlayerState = vi.fn(() => YT_PLAYER_STATE.UNSTARTED);
    mute = vi.fn();
    options: {
      videoId: string;
      playerVars: Record<string, unknown>;
      events: Record<string, unknown>;
    };
    constructor(
      _el: HTMLElement,
      options: {
        videoId: string;
        playerVars: Record<string, unknown>;
        events: Record<string, unknown>;
      },
    ) {
      this.options = options;
      instances.push(this);
    }
  }
  return { YT: { Player: FakePlayer }, instances };
}
const online = (data: unknown) => Promise.resolve({ status: 'online' as const, data }) as never;

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockImplementation(() => online({}));
  api.postHandled.mockImplementation(() => online({}));
});

const tracks = [
  { songId: 's1', title: 'First Song', audioRef: '/a1' },
  { songId: 's2', title: 'Second Song', audioRef: '/a2' },
  { songId: 's3', title: 'Third Song', audioRef: '/a3' },
];
type Controller = ReturnType<typeof useWalkmanController>;

/** A real Walkman controller inside a fake world env (the way WorldExperience wires it). */
function Harness({
  children,
  locale = 'en',
  assets = [],
  onWalkman,
}: {
  children: (env: WorldEnv) => ReactNode;
  locale?: 'en' | 'ar-EG';
  assets?: unknown[];
  onWalkman?: (w: Controller) => void;
}) {
  const walkman = useWalkmanController();
  onWalkman?.(walkman);
  const env = {
    locale,
    icons: [],
    assets,
    journey: {
      accessibleLocations: ['beach', 'church'],
      currentBeat: null,
      phase: 'free',
      keys: [],
    },
    walkman,
    t: (key: Parameters<typeof worldText>[0]) => worldText(key, locale),
    assetRef: () => null,
    notify: vi.fn(),
    showRewards: vi.fn(),
    refreshJourney: vi.fn().mockResolvedValue(null),
    applyJourney: vi.fn(),
  } as unknown as WorldEnv;
  return <WorldEnvProvider value={env}>{children(env)}</WorldEnvProvider>;
}

const withSongs = () =>
  api.get.mockImplementation(() =>
    online({
      releases: [
        { day: 'first_visit', songs: tracks.map((t) => ({ ...t, availableInWalkman: true })) },
      ],
    }),
  );

function setupDock() {
  let controller!: Controller;
  withSongs();
  render(<Harness onWalkman={(w) => (controller = w)}>{() => <WalkmanDock />}</Harness>);
  act(() => controller.hydrate(true, { track: null, playing: false }));
  return () => controller;
}

describe('Walkman panel', () => {
  it('is a control that opens a player, with a clear empty-playlist state', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() => online({ releases: [] }));
    let c!: Controller;
    render(<Harness onWalkman={(w) => (c = w)}>{() => <WalkmanDock />}</Harness>);
    expect(screen.queryByTestId('walkman')).not.toBeInTheDocument();
    act(() => c.hydrate(true, { track: null, playing: false }));
    await user.click(screen.getByTestId('walkman'));
    expect(screen.getByTestId('walkman-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('walkman-empty')).toBeInTheDocument();
    expect(screen.getByTestId('walkman-toggle')).toBeDisabled();
  });

  it('lists eligible tracks, marks the active one, and supports selection, next and previous', async () => {
    const user = userEvent.setup();
    const get = setupDock();
    await user.click(screen.getByTestId('walkman'));
    await screen.findByTestId('walkman-playlist');
    await user.click(screen.getByTestId('walkman-track-s2'));
    expect(screen.getByTestId('walkman-track-s2')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('walkman-track-s1')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('walkman-title')).toHaveTextContent('Second Song');
    await user.click(screen.getByTestId('walkman-next'));
    expect(get().track?.songId).toBe('s3');
    await user.click(screen.getByTestId('walkman-next'));
    expect(get().track?.songId).toBe('s1');
    await user.click(screen.getByTestId('walkman-prev'));
    expect(get().track?.songId).toBe('s3');
    expect(api.post).toHaveBeenCalledWith('/walkman', { songId: 's3', playing: true });
  });

  it('cycles repeat off, playlist, single; toggles shuffle and mute; sets volume', async () => {
    const user = userEvent.setup();
    const get = setupDock();
    await user.click(screen.getByTestId('walkman'));
    const repeat = screen.getByTestId('walkman-repeat');
    expect(repeat).toHaveAttribute('data-repeat', 'off');
    await user.click(repeat);
    expect(repeat).toHaveAttribute('data-repeat', 'playlist');
    await user.click(repeat);
    expect(repeat).toHaveAttribute('data-repeat', 'one');
    await user.click(repeat);
    expect(repeat).toHaveAttribute('data-repeat', 'off');
    await user.click(screen.getByTestId('walkman-shuffle'));
    expect(screen.getByTestId('walkman-shuffle')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('walkman-mute'));
    expect(get().muted).toBe(true);
    await user.click(screen.getByTestId('walkman-mute'));
    expect(get().muted).toBe(false);
    act(() => get().setVolume(0.4));
    expect(screen.getByTestId('walkman-volume')).toHaveValue('40');
  });

  it('opening and closing the panel never restarts the song (same audio node, no extra play)', async () => {
    const user = userEvent.setup();
    const get = setupDock();
    const before = screen.getByTestId('walkman-audio');
    act(() => get().select(tracks[0]!, true));
    const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await user.click(screen.getByTestId('walkman'));
    await user.click(screen.getByTestId('walkman-panel-close'));
    await user.click(screen.getByTestId('walkman'));
    expect(screen.getByTestId('walkman-audio')).toBe(before);
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(plays);
  });

  it('formats time and keeps a localized accessible name in Arabic', () => {
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(Number.NaN)).toBe('0:00');
    api.get.mockImplementation(() => online({ releases: [] }));
    let c!: Controller;
    render(
      <Harness locale="ar-EG" onWalkman={(w) => (c = w)}>
        {() => <WalkmanDock />}
      </Harness>,
    );
    act(() => c.hydrate(true, { track: null, playing: false }));
    expect(screen.getByTestId('walkman')).toHaveAccessibleName('افتحي الووكمان');
  });
});

describe('Walkman silence (Church)', () => {
  it('pauses on entry, keeps the track, and does NOT resume on leaving', () => {
    const { result } = renderHook(() => useWalkmanController());
    act(() => result.current.select(tracks[0]!, true));
    expect(result.current.playing).toBe(true);
    act(() => result.current.silence(true));
    expect(result.current.playing).toBe(false);
    expect(result.current.track?.songId).toBe('s1');
    act(() => result.current.silence(false));
    expect(result.current.playing).toBe(false);
    expect(result.current.track?.songId).toBe('s1');
  });

  it('hides the control and panel while silenced but keeps the same audio element', async () => {
    let c!: Controller;
    api.get.mockImplementation(() => online({ releases: [] }));
    render(<Harness onWalkman={(w) => (c = w)}>{() => <WalkmanDock />}</Harness>);
    act(() => c.hydrate(true, { track: tracks[0]!, playing: false }));
    const audio = screen.getByTestId('walkman-audio');
    await userEvent.setup().click(screen.getByTestId('walkman'));
    act(() => c.silence(true));
    expect(screen.queryByTestId('walkman')).not.toBeInTheDocument();
    expect(screen.queryByTestId('walkman-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('walkman-audio')).toBe(audio);
    act(() => c.silence(false));
    expect(screen.getByTestId('walkman')).toBeInTheDocument();
    expect(screen.queryByTestId('walkman-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('walkman-audio')).toBe(audio);
  });
});

const churchState = (
  lit: string[],
  preserved: string[] = [],
  slots: string[] = ['candle_1', 'candle_2'],
  capacity = 6,
  gospelReadingAudioRef?: string,
) => ({
  ok: true,
  today: '2026-09-21',
  verse: null,
  story: null,
  gallery: [],
  photo: null,
  hymns: [{ songId: 'h1', title: 'Hymn', artist: '', audioRef: '/hymn' }],
  quiz: { questions: [], completed: false, perfect: false, wrongAttempts: 0 },
  candles: { slots, lit, preserved, litToday: lit.length, capacity },
  firstInteractionDone: lit.length > 0,
  gospelReadingAudioRef,
});

describe('Church interior', () => {
  it('silences the Walkman on entry, shows no companion, and does not resume it on leaving', async () => {
    api.postIdempotent.mockImplementation(() => online(churchState([])));
    let c!: Controller;
    const view = render(
      <Harness onWalkman={(w) => (c = w)}>
        {() => <ChurchView onLeave={() => undefined} />}
      </Harness>,
    );
    await screen.findByTestId('church-candle-corner');
    expect(c.silenced).toBe(true);
    expect(screen.queryByTestId('world-companion')).not.toBeInTheDocument();
    view.unmount();
    expect(c.playing).toBe(false);
  });

  it('lights an unlit candle and puts a lit one out; the flame always matches the saved state', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() => online(churchState([])));
    api.postHandled.mockImplementation(((path: string) =>
      online(churchState(path.endsWith('extinguish') ? [] : ['candle_1']))) as never);
    render(<Harness>{() => <ChurchView onLeave={() => undefined} />}</Harness>);
    await user.click(await screen.findByTestId('church-candle-corner'));
    const candle = await screen.findByTestId('candle-candle_1');
    expect(screen.queryByTestId('world-companion')).not.toBeInTheDocument();
    expect(candle).toHaveAttribute('aria-pressed', 'false');
    await user.click(candle);
    await waitFor(() => expect(candle).toHaveAttribute('aria-pressed', 'true'));
    expect(candle).toHaveAttribute('data-lit', 'true');
    expect(api.postHandled).toHaveBeenLastCalledWith(
      '/church/candle',
      { candleId: 'candle_1' },
      'en',
    );
    await user.click(candle);
    await waitFor(() => expect(candle).toHaveAttribute('aria-pressed', 'false'));
    expect(api.postHandled).toHaveBeenLastCalledWith(
      '/church/candle/extinguish',
      { candleId: 'candle_1' },
      'en',
    );
    await user.click(screen.getByTestId('church-candle-back'));
    expect(await screen.findByTestId('church-interior')).toBeInTheDocument();
  });

  it('sends one request per tap burst and keeps an occasion candle lit', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() => online(churchState(['candle_2'], ['candle_2'])));
    let release!: () => void;
    api.postHandled.mockImplementation(
      (() =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 'online',
              data: churchState(['candle_1', 'candle_2'], ['candle_2']),
            });
        })) as never,
    );
    render(<Harness>{() => <ChurchView onLeave={() => undefined} />}</Harness>);
    await user.click(await screen.findByTestId('church-candle-corner'));
    await user.click(await screen.findByTestId('candle-candle_2'));
    expect(api.postHandled).not.toHaveBeenCalled();
    const one = screen.getByTestId('candle-candle_1');
    await user.click(one);
    await user.click(one);
    await user.click(one);
    expect(api.postHandled).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('adds a new candle via the Add control, which is disabled once the tray is full', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() =>
      online(churchState([], [], ['candle_1', 'candle_2'], 3)),
    );
    api.postHandled.mockImplementation(() =>
      online(churchState([], [], ['candle_1', 'candle_2', 'candle_a1'], 3)),
    );
    render(<Harness>{() => <ChurchView onLeave={() => undefined} />}</Harness>);
    await user.click(await screen.findByTestId('church-candle-corner'));
    const add = await screen.findByTestId('candle-add');
    expect(add).toBeEnabled();
    await user.click(add);
    expect(api.postHandled.mock.calls[0]![0]).toBe('/church/candle/add');
    expect(api.postHandled.mock.calls[0]![1]).toMatchObject({});
    expect(
      (api.postHandled.mock.calls[0]![1] as { clientRequestId: string }).clientRequestId,
    ).toEqual(expect.any(String));
    await screen.findByTestId('candle-candle_a1');
    // Now at 3/3: Add is disabled and a tap notifies instead of calling the server.
    await waitFor(() => expect(screen.getByTestId('candle-add')).toBeDisabled());
    const calls = api.postHandled.mock.calls.length;
    await user.click(screen.getByTestId('candle-add'));
    expect(api.postHandled.mock.calls.length).toBe(calls);
  });

  it('selects a candle via its chip (not the light/extinguish tap) and removes it with Remove selected candle', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() =>
      online(churchState(['candle_1'], [], ['candle_1', 'candle_2'])),
    );
    api.postHandled.mockImplementation((() => online(churchState([], [], ['candle_2']))) as never);
    render(<Harness>{() => <ChurchView onLeave={() => undefined} />}</Harness>);
    await user.click(await screen.findByTestId('church-candle-corner'));
    await screen.findByTestId('candle-candle_1');
    const remove = screen.getByTestId('candle-remove');
    expect(remove).toBeDisabled();
    const chip = screen.getByTestId('candle-select-candle_1');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Selecting never toggles the candle's own light/extinguish state.
    expect(api.postHandled).not.toHaveBeenCalled();
    expect(screen.getByTestId('candle-candle_1')).toHaveAttribute('aria-pressed', 'true');
    expect(remove).toBeEnabled();
    await user.click(remove);
    expect(api.postHandled).toHaveBeenCalledWith(
      '/church/candle/remove',
      { candleId: 'candle_1' },
      'en',
    );
    await waitFor(() => expect(screen.queryByTestId('candle-candle_1')).not.toBeInTheDocument());
  });

  it('renders in the graceful no-art fallback without crashing (jsdom never resolves an image)', async () => {
    const user = userEvent.setup();
    api.postIdempotent.mockImplementation(() => online(churchState([])));
    render(<Harness>{() => <ChurchView onLeave={() => undefined} />}</Harness>);
    await user.click(await screen.findByTestId('church-candle-corner'));
    expect(await screen.findByTestId('candle-tray')).toBeInTheDocument();
    expect(screen.getByTestId('candle-candle_1')).toBeInTheDocument();
    expect(screen.getByTestId('candle-select-candle_1')).toBeInTheDocument();
    expect(screen.getByTestId('candle-add')).toBeInTheDocument();
  });
});
describe('Silent Church interior', () => {
  it('ignores legacy reading URLs in both interior and candle corner and leaves immediately', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    api.postIdempotent.mockImplementation(() =>
      online(churchState([], [], ['candle_1', 'candle_2'], 6, '/api/media/reading?v=1')),
    );
    render(<Harness>{() => <ChurchView onLeave={onLeave} />}</Harness>);
    await screen.findByTestId('church-interior');
    expect(screen.queryByTestId('church-mute-audio')).toBeNull();
    expect(screen.queryByTestId('church-reading-enable-audio')).toBeNull();
    await user.click(screen.getByTestId('church-candle-corner'));
    expect(screen.queryByTestId('church-mute-audio')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});

describe('Vinyl Café direct access', () => {
  const cafe = {
    releases: [],
    gramophoneOpened: false,
    walkmanUnlocked: false,
    walkman: null,
    cardsRead: [],
  };

  it('can be entered without the Church, but explains its story activities and sends nothing', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() => online(cafe));
    render(<Harness>{() => <CafeView onLeave={() => undefined} storyOpen={false} />}</Harness>);
    await user.click(await screen.findByTestId('cafe-gramophone'));
    expect(screen.getByTestId('cafe-locked-text')).toHaveTextContent(/first visit to the Church/);
    expect(api.postIdempotent).not.toHaveBeenCalled();
    expect(screen.getByTestId('cafe-leave')).toBeInTheDocument();
  });

  it('opens the gramophone when the story has reached it', async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(() => online(cafe));
    api.postIdempotent.mockImplementation(() => online(cafe));
    render(<Harness>{() => <CafeView onLeave={() => undefined} storyOpen />}</Harness>);
    await user.click(await screen.findByTestId('cafe-gramophone'));
    expect(api.postIdempotent).toHaveBeenCalled();
  });
});

describe('Beach ocean view (YouTube IFrame Player API)', () => {
  beforeEach(() => {
    loadYouTubeIframeApi.mockReset();
  });

  it('shows a poster and loading text, then loads the player only now, at the verified daytime video, muted/looping/autoplay', async () => {
    const { YT, instances } = createFakeYT();
    loadYouTubeIframeApi.mockReturnValue(Promise.resolve(YT));
    render(<Harness>{() => <OceanView onClose={() => undefined} />}</Harness>);
    expect(screen.getByTestId('ocean-poster')).toHaveAttribute(
      'src',
      expect.stringContaining(OCEAN_DAYTIME_VIDEO_ID),
    );
    expect(screen.getByTestId('ocean-loading')).toBeInTheDocument();
    await waitFor(() => expect(instances).toHaveLength(1));
    const player = instances[0]!;
    expect(player.options.videoId).toBe(OCEAN_DAYTIME_VIDEO_ID);
    expect(player.options.playerVars).toMatchObject({
      autoplay: 1,
      mute: 1,
      loop: 1,
      playlist: OCEAN_DAYTIME_VIDEO_ID,
    });
    // onReady: seeks to a random point using the real duration, then plays — never clipped.
    act(() =>
      (player.options.events as { onReady: (e: unknown) => void }).onReady({ target: player }),
    );
    expect(player.getDuration).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(expect.any(Number), true);
    const [seekedTo] = player.seekTo.mock.calls[0]!;
    expect(seekedTo).toBeGreaterThanOrEqual(0);
    expect(seekedTo).toBeLessThan(60);
    expect(player.playVideo).toHaveBeenCalled();
    // Confirmed playing: the poster and loading text step aside for YouTube's own UI.
    act(() =>
      (player.options.events as { onStateChange: (e: unknown) => void }).onStateChange({
        target: player,
        data: YT_PLAYER_STATE.PLAYING,
      }),
    );
    expect(screen.queryByTestId('ocean-poster')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocean-loading')).not.toBeInTheDocument();
  });

  it('shows an explicit Play control if autoplay does not actually start, without covering YouTube’s own UI with a poster', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { YT, instances } = createFakeYT();
    loadYouTubeIframeApi.mockReturnValue(Promise.resolve(YT));
    render(<Harness>{() => <OceanView onClose={() => undefined} />}</Harness>);
    await waitFor(() => expect(instances).toHaveLength(1));
    const player = instances[0]!;
    act(() =>
      (player.options.events as { onReady: (e: unknown) => void }).onReady({ target: player }),
    );
    // getPlayerState stays UNSTARTED (the default fake): autoplay never actually confirmed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('ocean-play')).toBeInTheDocument();
    expect(screen.queryByTestId('ocean-poster')).not.toBeInTheDocument();
    await act(async () => {
      screen.getByTestId('ocean-play').click();
    });
    expect(player.playVideo).toHaveBeenCalledTimes(2);
  });

  it('shows an honest, retryable error when YouTube reports the video cannot be embedded here, and Back still closes', async () => {
    const first = createFakeYT();
    loadYouTubeIframeApi.mockReturnValueOnce(Promise.resolve(first.YT));
    const onClose = vi.fn();
    render(<Harness>{() => <OceanView onClose={onClose} />}</Harness>);
    await waitFor(() => expect(first.instances).toHaveLength(1));
    act(() =>
      (first.instances[0]!.options.events as { onError: (e: unknown) => void }).onError({
        target: first.instances[0],
        data: 101,
      }),
    );
    expect(screen.getByTestId('ocean-failed')).toHaveTextContent(/cannot be played here/);
    await userEvent.setup().click(screen.getByTestId('ocean-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('retries by destroying the old player and creating a fresh one', async () => {
    const first = createFakeYT();
    const second = createFakeYT();
    loadYouTubeIframeApi
      .mockReturnValueOnce(Promise.resolve(first.YT))
      .mockReturnValueOnce(Promise.resolve(second.YT));
    render(<Harness>{() => <OceanView onClose={() => undefined} />}</Harness>);
    await waitFor(() => expect(first.instances).toHaveLength(1));
    act(() =>
      (first.instances[0]!.options.events as { onError: (e: unknown) => void }).onError({
        target: first.instances[0],
        data: 150,
      }),
    );
    await userEvent.setup().click(await screen.findByTestId('ocean-retry'));
    await waitFor(() => expect(second.instances).toHaveLength(1));
    expect(first.instances[0]!.destroy).toHaveBeenCalled();
  });

  it('destroys the player on close (nothing keeps playing or buffering)', async () => {
    const { YT, instances } = createFakeYT();
    loadYouTubeIframeApi.mockReturnValue(Promise.resolve(YT));
    const view = render(<Harness>{() => <OceanView onClose={() => undefined} />}</Harness>);
    await waitFor(() => expect(instances).toHaveLength(1));
    view.unmount();
    expect(instances[0]!.destroy).toHaveBeenCalled();
  });

  it('picks a valid random start point using the real duration, leaving a short tail, and none without a usable duration', () => {
    for (let i = 0; i < 50; i++) {
      const at = randomStartSeconds(60)!;
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(60);
    }
    expect(randomStartSeconds(Number.NaN)).toBeNull();
    expect(randomStartSeconds(0)).toBeNull();
    expect(randomStartSeconds(-5)).toBeNull();
  });
});

describe('map anchors', () => {
  it('places each destination on its building in the island painting', () => {
    const at = (id: string) => MAP_ANCHORS[id]!;
    expect(at('museum')[1]).toBeLessThan(at('cottage')[1]);
    expect(at('cottage')[0]).toBeGreaterThan(60);
    expect(at('arcade')[1]).toBeGreaterThan(at('cottage')[1]);
    expect(Math.abs(at('arcade')[0] - at('cottage')[0])).toBeLessThan(10);
    expect(at('cafe')[0]).toBeGreaterThan(55);
    expect(at('cafe')[1]).toBeGreaterThan(at('arcade')[1]);
    expect(at('church')[0]).toBeLessThan(50);
    expect(at('church')[1]).toBeGreaterThan(50);
    expect(at('farm')[0]).toBeLessThan(25);
    expect(at('beach')[1]).toBeGreaterThan(85);
    for (const [x, y] of Object.values(MAP_ANCHORS)) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });
});
