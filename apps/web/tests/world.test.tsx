import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WORLD_UI_TEXT, type RuntimeDialogueLine } from '@veoullas-world/contracts';
import { worldText } from '../src/features/world/worldText';
import {
  catchTarget,
  memoryPairs,
  memoryScore,
  neighbours,
  shuffle,
  shufflePuzzle,
} from '../src/features/world/games/games';
import { splitRemaining } from '../src/features/world/views/CottageView';
import { BeatNarration, dialogueIdsFor } from '../src/features/world/Narration';
import { WorldExperience, initialPlace } from '../src/features/world/WorldExperience';
import { SAMPLE_WORLD_JOURNEY, installMockFetch } from './helpers/mockApi';
import { useLocaleStore } from '../src/i18n/localeStore';

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  window.sessionStorage.clear();
});

describe('world interface text', () => {
  it('has every label in all five languages and prefers an edited Sheet row', () => {
    for (const [key, labels] of Object.entries(WORLD_UI_TEXT)) {
      expect(labels, key).toHaveLength(5);
    }
    expect(worldText('church_light_candle', 'en')).toBe('Light a candle');
    expect(worldText('church_light_candle', 'ar-EG')).toBe('ولّعي شمعة');
    expect(worldText('church_light_candle', 'fr')).toBe('Allume une bougie');
    const edited = [
      {
        uiTextRowId: 'r',
        textId: 'world_church_light_candle',
        screenId: 'world',
        componentId: 'x',
        locale: 'it',
        text: 'Modificato nello Sheet',
        direction: 'ltr' as const,
        ariaLabel: '',
      },
    ];
    expect(worldText('church_light_candle', 'it', edited)).toBe('Modificato nello Sheet');
  });
});

describe('arcade game rules', () => {
  it('grows the memory deck with the server-assigned level, and scores by move budget', () => {
    expect([1, 2, 3, 4, 5].map(memoryPairs)).toEqual([3, 4, 5, 6, 8]);
    expect(memoryScore(3, 5).result).toBe('win');
    expect(memoryScore(3, 40).result).toBe('lose');
    expect(memoryScore(3, 40).score).toBeGreaterThan(0);
    expect(catchTarget(5)).toBeGreaterThan(catchTarget(1));
  });

  it('shuffles deterministically and always produces a solvable sliding puzzle', () => {
    const rng = (() => {
      let seed = 7;
      return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    })();
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    for (let round = 0; round < 25; round++) {
      const tiles = shufflePuzzle(3, 30, rng);
      const flat = tiles.filter((t) => t !== 8);
      let inversions = 0;
      for (let i = 0; i < flat.length; i++)
        for (let j = i + 1; j < flat.length; j++) if (flat[i]! > flat[j]!) inversions++;
      expect(inversions % 2).toBe(0);
    }
    expect(neighbours(4, 3).sort()).toEqual([1, 3, 5, 7]);
    expect(neighbours(0, 3).sort()).toEqual([1, 3]);
  });
});

describe('cottage countdown', () => {
  it('splits the remaining time into days, hours, minutes and seconds', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const target = now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(splitRemaining(target, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(splitRemaining(now - 5000, now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('beat narration (text-only, player-paced)', () => {
  const line = (id: string, seq: number, text: string): RuntimeDialogueLine => ({
    dialogueRowId: `${id}_en`,
    dialogueId: id,
    groupId: 'grp',
    sequence: seq,
    speakerId: 'var',
    locale: 'en',
    text,
    direction: 'ltr',
    emotion: '',
    displayMode: 'narration',
    requiresResponse: false,
  });

  it('shows nothing when the Sheet has no rows for the group (never invents narration)', () => {
    const { container } = render(
      <BeatNarration groupId="missing" seenKey="k0" dialogue={[]} locale="en" uiText={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("advances only on the player's own Continue, then stays dismissed", async () => {
    const dialogue = [line('b', 2, 'Second'), line('a', 1, 'First')];
    expect(dialogueIdsFor(dialogue, 'grp')).toEqual(['a', 'b']);
    const user = userEvent.setup();
    render(
      <BeatNarration groupId="grp" seenKey="k1" dialogue={dialogue} locale="en" uiText={[]} />,
    );
    expect(screen.getByTestId('dialogue-text-line')).toHaveTextContent('First');
    await user.click(screen.getByTestId('narration-continue'));
    expect(screen.getByTestId('dialogue-text-line')).toHaveTextContent('Second');
    await user.click(screen.getByTestId('narration-continue'));
    expect(screen.queryByTestId('beat-narration')).not.toBeInTheDocument();
    // A remount in the same session does not replay it.
    render(
      <BeatNarration groupId="grp" seenKey="k1" dialogue={dialogue} locale="en" uiText={[]} />,
    );
    expect(screen.queryByTestId('beat-narration')).not.toBeInTheDocument();
  });
});

describe('where the world starts', () => {
  const journey = (overrides: Record<string, unknown>) =>
    ({ ...SAMPLE_WORLD_JOURNEY, ...overrides }) as unknown as Parameters<typeof initialPlace>[0];

  it("begins at the Cottage after completion, otherwise at the current beat's place", () => {
    expect(
      initialPlace(journey({ phase: 'free', completed: true, startLocation: 'cottage' })),
    ).toEqual({
      id: 'cottage',
      view: 'interior',
    });
    expect(initialPlace(journey({}))).toEqual({ id: 'beach', view: 'exterior' });
    expect(initialPlace(journey({ startLocation: 'cafe' }))).toEqual({
      id: 'cafe',
      view: 'exterior',
    });
    expect(
      initialPlace(
        journey({ startLocation: 'museum', currentBeat: { requiredInteractionId: 'map_receive' } }),
      ),
    ).toEqual({ id: 'museum', view: 'interior' });
    expect(
      initialPlace(
        journey({
          startLocation: 'museum',
          currentBeat: { requiredInteractionId: 'museum_key_check' },
        }),
      ),
    ).toEqual({ id: 'museum', view: 'exterior' });
  });
});

describe('<WorldExperience />', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('after completion starts at the Cottage with the Map available and labelled temporary art', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      worldJourneyResult: {
        ...SAMPLE_WORLD_JOURNEY,
        phase: 'free',
        completed: true,
        mapUnlocked: true,
        currentBeat: null,
        startLocation: 'cottage',
        accessibleLocations: ['beach', 'church', 'cottage'],
        keys: [
          { keyTypeId: 'key_shell', locationId: 'beach', shape: 'shell', iconId: '', quantity: 1 },
        ],
      },
    });
    render(<WorldExperience userId="fixture_owner" />);
    const world = await screen.findByTestId('world-experience');
    await waitFor(() => expect(world).toHaveAttribute('data-place', 'cottage'));
    expect(world).toHaveAttribute('data-view', 'interior');
    expect(await screen.findByTestId('open-map')).toBeInTheDocument();
    expect(screen.getByTestId('temporary-visual')).toBeInTheDocument();
    expect(within(screen.getByTestId('keys-hud')).getByTestId('key-key_shell')).toHaveTextContent(
      '1',
    );
  });

  it('offers Replay or Skip only when the Admin force flag is on', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      worldJourneyResult: {
        ...SAMPLE_WORLD_JOURNEY,
        phase: 'replay_offer',
        completed: true,
        forced: true,
        startLocation: 'cottage',
        currentBeat: null,
      },
    });
    render(<WorldExperience userId="fixture_owner" />);
    expect(await screen.findByTestId('replay-offer')).toBeInTheDocument();
    expect(screen.getByTestId('replay-start')).toBeInTheDocument();
    expect(screen.getByTestId('replay-skip')).toBeInTheDocument();
  });

  it('shows interface text in the active language', async () => {
    useLocaleStore.setState({ locale: 'ar-EG' });
    installMockFetch({
      ownerSession: 'authenticated',
      worldJourneyResult: {
        ...SAMPLE_WORLD_JOURNEY,
        phase: 'free',
        completed: true,
        mapUnlocked: true,
        currentBeat: null,
        startLocation: 'cottage',
        accessibleLocations: ['cottage'],
      },
    });
    render(<WorldExperience userId="fixture_owner" />);
    const map = await screen.findByTestId('open-map');
    expect(map).toHaveAccessibleName('افتحي الخريطة');
    expect(map).toHaveAttribute('title', 'افتحي الخريطة');
    expect(map).toHaveTextContent('');
    expect(map.querySelector('svg, img')).not.toBeNull();
  });
});

describe('achievements panel', () => {
  it('opens from the HUD button, loads the player-facing list, and shows locked/unlocked/secret states', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerAchievementsResult: {
        ok: true,
        achievements: [
          {
            achievementId: 'ach_first_key',
            category: 'keys',
            status: 'unlocked',
            secret: false,
            points: 10,
            progressValue: 0,
            unlockedAt: '2026-01-02T00:00:00.000Z',
            iconRef: null,
            title: 'First Key',
            description: 'Found your first key.',
          },
          {
            achievementId: 'ach_locked',
            category: 'keys',
            status: 'locked',
            secret: false,
            points: 5,
            progressValue: 0,
            unlockedAt: '',
            iconRef: null,
            title: 'Second Key',
            description: 'Find the second key.',
          },
          {
            achievementId: 'ach_secret',
            category: 'story',
            status: 'locked',
            secret: true,
            points: 0,
            progressValue: 0,
            unlockedAt: '',
            iconRef: null,
            title: '',
            description: '',
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<WorldExperience userId="fixture_owner" />);
    await screen.findByTestId('world-experience');

    await user.click(screen.getByTestId('open-achievements'));
    const panel = await screen.findByTestId('achievements-panel');
    const unlocked = within(panel).getByTestId('achievement-ach_first_key');
    expect(unlocked).toHaveAttribute('data-status', 'unlocked');
    expect(unlocked).toHaveTextContent('First Key');
    expect(unlocked).toHaveTextContent('Found your first key.');

    const locked = within(panel).getByTestId('achievement-ach_locked');
    expect(locked).toHaveAttribute('data-status', 'locked');
    expect(locked).toHaveTextContent('Second Key');
    expect(locked).not.toHaveTextContent('Find the second key.');

    const secret = within(panel).getByTestId('achievement-ach_secret');
    expect(secret).toHaveAttribute('data-status', 'locked');
    expect(secret).not.toHaveTextContent('ach_secret');
  });

  it('shows an empty state when the player has no catalog rows yet', async () => {
    installMockFetch({
      ownerSession: 'authenticated',
      playerAchievementsResult: { ok: true, achievements: [] },
    });
    const user = userEvent.setup();
    render(<WorldExperience userId="fixture_owner" />);
    await screen.findByTestId('world-experience');
    await user.click(screen.getByTestId('open-achievements'));
    expect(await screen.findByTestId('achievements-empty')).toBeInTheDocument();
  });
});
