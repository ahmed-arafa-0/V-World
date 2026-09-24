import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  CafeStateResponse,
  ContentRuntimeResponse,
  JourneyStateResponse,
  MapStateResponse,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { LoadingState } from '../../components/LoadingState';
import { useLocaleStore } from '../../i18n/localeStore';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { SceneJourney } from '../scene-engine/SceneJourney';
import { FIRST_OPENING_BEACH_JOURNEY } from '../scene-engine/sceneDefinitions';
import { Ambience } from './Ambience';
import { AchievementsPanel } from './AchievementsPanel';
import { BirthdayOverlay } from '../birthday/BirthdayOverlay';
import { activeGameStore } from '../birthday/activeGameStore';
import { fetchBootstrap } from '../../services/bootstrapClient';
import { BeatNarration } from './Narration';
import { Panel, ActionButton, TextBlock } from './ui';
import { WorldEnvProvider, type Place, type PlaceId, type WorldEnv } from './WorldContext';
import { useWalkmanController } from './useWalkman';
import { actionPending, onActionFailure, pendingCompletion, worldApi } from './worldClient';
import { fetchCharacterState } from '../../services/characterClient';
import { withCompanionName, worldText } from './worldText';
import { ArcadeView } from './views/ArcadeView';
import { CafeView } from './views/CafeView';
import { OceanView } from './OceanView';
import { WalkmanDock, walkmanTracksFrom } from './Walkman';
import { SceneIcon } from '../../components/SceneIcon';
import { ChurchView } from './views/ChurchView';
import { CottageView } from './views/CottageView';
import { CottageExterior, LocationExterior } from './views/Exterior';
import { FarmView } from './views/FarmView';
import { Junction } from './views/Junction';
import { MapView } from './views/MapView';
import { MuseumApproach, MuseumHall } from './views/MuseumView';
import styles from './world.module.css';

/** The road, in first-visit order (11_LOCATIONS map_order); the server decides which of these are open. */
const DEFAULT_ROAD: PlaceId[] = ['beach', 'church', 'cafe', 'arcade', 'cottage', 'farm', 'museum'];

/** Where the client begins: the Cottage once the journey is complete, otherwise where the current beat is. */
export function initialPlace(journey: JourneyStateResponse): Place {
  const location = journey.startLocation as PlaceId;
  const interaction = journey.currentBeat?.requiredInteractionId ?? '';
  if (journey.phase === 'free' || journey.phase === 'replay_offer') {
    if (location === 'farm') return { id: 'farm', view: 'exterior' };
    return { id: DEFAULT_ROAD.includes(location) ? location : 'cottage', view: 'interior' };
  }
  if (location === 'museum') {
    const inHall = ['hall_artifact_view', 'map_receive', 'map_open'].includes(interaction);
    return { id: 'museum', view: inHall ? 'interior' : 'exterior' };
  }
  if (location === 'church' || location === 'beach') return { id: 'beach', view: 'exterior' };
  return { id: DEFAULT_ROAD.includes(location) ? location : 'beach', view: 'exterior' };
}

export interface WorldExperienceProps {
  userId: string;
  /** The Phase-1 Beach shell interaction (kept in FirstOpeningFlow). */
  onBeachMarker?: (markerId: string, locationId: string) => Promise<string | void> | string | void;
}

/**
 * The Phase 2 world: Church → Vinyl Café → VARcade → Cottage → Sunberry Fields →
 * The Everkeep → the Map. Everything that grants a key or opens a place is
 * decided by the backend; this component only presents it.
 */
export function WorldExperience({ userId, onBeachMarker }: WorldExperienceProps) {
  const locale = useLocaleStore((s) => s.locale);
  const walkman = useWalkmanController();
  const [journey, setJourney] = useState<JourneyStateResponse | null>(null);
  const [content, setContent] = useState<ContentRuntimeResponse | null>(null);
  const [road, setRoad] = useState<PlaceId[]>(DEFAULT_ROAD);
  const [place, setPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [slowStart, setSlowStart] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pending = useSyncExternalStore(actionPending.subscribe, actionPending.count);
  const activeGame = useSyncExternalStore(activeGameStore.subscribe, activeGameStore.isActive);
  const [freedom, setFreedom] = useState('');
  const [ambient, setAmbient] = useState<Record<string, string>>({});
  const [companionName, setCompanionName] = useState<string | null>(null);
  const [ocean, setOcean] = useState(false);
  const [explain, setExplain] = useState<Parameters<typeof worldText>[0] | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  /** The beach scene the player left for the crossroads, so Back returns to exactly there. */
  const beachNode = useRef('beach_steps');
  const mapOrigin = useRef<PlaceId>('cottage');
  const beachLocation = useRef<PlaceId>('beach');
  /** The last `place` key the Church-exterior bell already played for, so re-renders (or leaving and
   * returning within the same node) never trigger a duplicate ring — only an actual arrival does. */
  const churchBellArrivalKey = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const journeyRef = useRef<JourneyStateResponse | null>(null);
  const refreshJourneyRef = useRef<(() => Promise<JourneyStateResponse | null>) | null>(null);
  journeyRef.current = journey;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // A retryable/unconfirmed action failure is said out loud, then reconciled with the server's state.
  useEffect(
    () =>
      onActionFailure((failure) => {
        notify(worldText(failure.unconfirmed ? 'save_unconfirmed' : 'saving_retry', locale));
        if (failure.unconfirmed) void refreshJourneyRef.current?.();
      }),
    [locale, notify],
  );

  // Initial load: journey, content runtime, the road, and the persisted Walkman selection.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSlowStart(false);
    const slowTimer = window.setTimeout(() => setSlowStart(true), 6000);
    void (async () => {
      void fetchBootstrap().then((b) => {
        if (!cancelled && b.status === 'online') {
          setAmbient(
            Object.fromEntries(b.data.locations.map((l) => [l.locationId, l.ambientAssetId])),
          );
        }
      });
      const [j, c, m] = await Promise.all([
        worldApi.get<JourneyStateResponse>('/journey'),
        fetchContentRuntime(),
        worldApi.get<MapStateResponse>('/map'),
      ]);
      window.clearTimeout(slowTimer);
      if (cancelled) return;
      // A failed read is never a new player: keep the explicit retry view, never a default place.
      if (j.status !== 'online') return setFailed(true);
      if (c.status === 'online') setContent(c.data);
      if (m.status === 'online' && m.data.locations.length > 0) {
        setRoad(m.data.locations.map((l) => l.locationId as PlaceId));
      }
      setJourney(j.data);
      setPlace(initialPlace(j.data));
      // The name the player chose for the companion; shown wherever the story text names it.
      void fetchCharacterState('var').then((c) => {
        if (!cancelled && c.status === 'online')
          setCompanionName(c.data.character?.personalName || null);
      });
      if (j.data.walkmanUnlocked) {
        const cafe = await worldApi.get<CafeStateResponse>('/cafe', locale);
        if (cancelled) return;
        const selection = cafe.status === 'online' ? cafe.data.walkman : null;
        const song =
          cafe.status === 'online'
            ? cafe.data.releases.flatMap((r) => r.songs).find((s) => s.songId === selection?.songId)
            : undefined;
        if (cafe.status === 'online') walkman.setPlaylist(walkmanTracksFrom(cafe.data));
        walkman.hydrate(true, {
          track: song?.audioRef
            ? { songId: song.songId, title: song.title, audioRef: song.audioRef }
            : null,
          playing: false,
        });
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
    // The controller identity is stable enough; re-running on locale would reset the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  // A completion remembered locally (Sheet briefly unavailable) is retried until the backend confirms it.
  useEffect(() => {
    if (!journey || journey.completed || !pendingCompletion.has(userId)) return;
    const timer = window.setInterval(() => {
      void worldApi
        .post<JourneyStateResponse>('/journey/ack', { interactionId: 'map_receive' })
        .then((r) => {
          if (r.status === 'online') {
            pendingCompletion.clear(userId);
            setJourney(r.data);
          }
        });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [journey, userId]);

  // A short bell on arrival at the Church exterior (the beach's `church_focus` node), never the
  // interior. Edge-triggered on the place actually changing, so it never repeats on unrelated
  // re-renders while the player lingers there; a blocked/rejected one-shot is silently dropped
  // (Living Bible §18B-1 — respects the same browser audio-gesture rule as every other sound).
  useEffect(() => {
    if (!place || place.id !== 'beach' || place.node !== 'church_focus') return;
    const key = `${place.id}:${place.node}`;
    if (churchBellArrivalKey.current === key) return;
    churchBellArrivalKey.current = key;
    const bellRef = content?.assets.find(
      (a) => a.assetId === 'audio_church_bell_exterior',
    )?.mediaRef;
    if (!bellRef) return;
    const bell = new Audio(bellRef);
    void bell.play().catch(() => undefined);
  }, [place, content]);

  const refreshJourney = useCallback(async () => {
    const r = await worldApi.get<JourneyStateResponse>('/journey');
    if (r.status !== 'online') return null;
    setJourney(r.data);
    if (r.data.walkmanUnlocked) walkman.unlock();
    return r.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  refreshJourneyRef.current = refreshJourney;

  const t = useCallback(
    (key: Parameters<typeof worldText>[0]) =>
      withCompanionName(worldText(key, locale, content?.uiText ?? []), companionName, locale),
    [locale, content, companionName],
  );

  const assetRef = useCallback(
    (assetId: string | undefined) =>
      assetId ? (content?.assets.find((a) => a.assetId === assetId)?.mediaRef ?? null) : null,
    [content],
  );

  const dialogueLines = useMemo(
    () =>
      (content?.dialogue ?? []).map((line) => ({
        ...line,
        text: withCompanionName(line.text, companionName, locale),
      })),
    [content, companionName, locale],
  );

  const env = useMemo<WorldEnv | null>(() => {
    if (!journey) return null;
    return {
      userId,
      locale,
      uiText: content?.uiText ?? [],
      icons: content?.icons ?? [],
      assets: content?.assets ?? [],
      dialogue: dialogueLines,
      journey,
      walkman,
      t,
      applyJourney: setJourney,
      refreshJourney,
      showRewards: (rewards: WorldRewardView[] | undefined) => {
        if (rewards?.some((r) => r.applied)) notify(t('key_received'));
      },
      notify,
      go: setPlace,
      assetRef,
    };
  }, [
    journey,
    userId,
    locale,
    content,
    dialogueLines,
    walkman,
    t,
    refreshJourney,
    notify,
    assetRef,
  ]);

  if (failed) {
    return (
      <div className={styles.world} data-testid="world-failed">
        <div className={styles.startNotice}>
          <p role="alert">{worldText('saving_retry', locale)}</p>
          <ActionButton testId="world-retry" onClick={() => setLoadAttempt((n) => n + 1)}>
            {worldText('try_again', locale)}
          </ActionButton>
        </div>
      </div>
    );
  }
  if (!env || !place) {
    return (
      <div className={styles.world} data-testid="world-loading">
        <LoadingState label="…" />
        {slowStart && (
          <p className={styles.startNotice} role="status" data-testid="world-slow">
            {worldText('still_loading', locale)}
          </p>
        )}
      </div>
    );
  }

  const go = (id: PlaceId, view: Place['view'] = 'exterior') => setPlace({ id, view });
  const idx = road.indexOf(place.id);
  const next = idx >= 0 ? road[idx + 1] : undefined;
  const open = (id: PlaceId | undefined) =>
    id && journey!.accessibleLocations.includes(id) ? id : undefined;
  const forward = open(next);
  const enterFromMap = (id: PlaceId) => {
    if (id === 'beach') setPlace({ id, view: 'exterior', node: 'beach_steps' });
    else go(id, id === 'farm' ? 'exterior' : 'interior');
  };

  const beat = journey!.currentBeat;
  const narrationBeat =
    beat && beat.locationId === place.id && journey!.phase !== 'free' ? beat : null;
  const lastBeat = journey!.beats[journey!.beats.length - 1];

  function view() {
    switch (place!.id) {
      case 'beach':
        return (
          <SceneJourney
            journey={FIRST_OPENING_BEACH_JOURNEY}
            userId={userId}
            startNodeId={place!.node}
            onLocationChange={(id) => {
              beachLocation.current = id as PlaceId;
            }}
            onMarkerActivate={async (markerId, locationId, nodeId) => {
              if (markerId === 'church_door') return go('church', 'interior');
              if (markerId === 'road_onward') {
                beachNode.current = nodeId;
                return go('junction', 'exterior');
              }
              if (markerId === 'shell') {
                setOcean(true);
                // The shell pays its key once (the server is idempotent); reopening only shows the ocean.
                const held = journey!.keys.some((k) => k.locationId === 'beach' && k.quantity > 0);
                if (held) return markerId;
                const message = await onBeachMarker?.(markerId, locationId);
                void refreshJourney();
                return message;
              }
              return onBeachMarker?.(markerId, locationId);
            }}
          />
        );
      case 'junction':
        return (
          <Junction
            onChurch={() => setPlace({ id: 'beach', view: 'exterior', node: 'church_focus' })}
            onCafe={() => go('cafe')}
            onAhead={() => go('arcade')}
            onBack={() => setPlace({ id: 'beach', view: 'exterior', node: beachNode.current })}
          />
        );
      case 'church':
        return <ChurchView onLeave={() => go('beach')} />;
      case 'cafe':
        return place!.view === 'interior' ? (
          <CafeView onLeave={() => go('cafe', 'exterior')} storyOpen={!!open('cafe')} />
        ) : (
          <LocationExterior
            locationId="cafe"
            theme="cafe"
            onEnter={() => go('cafe', 'interior')}
            onBack={() => go('junction')}
          />
        );
      case 'arcade':
        return place!.view === 'interior' ? (
          <ArcadeView onLeave={() => go('arcade', 'exterior')} />
        ) : (
          <LocationExterior
            locationId="arcade"
            theme="arcade"
            onEnter={() =>
              open('arcade') ? go('arcade', 'interior') : setExplain('arcade_story_locked')
            }
            onBack={() => go('junction')}
            onForward={forward === 'cottage' ? () => go('cottage') : undefined}
          />
        );
      case 'cottage':
        return place!.view === 'interior' ? (
          <CottageView onLeave={() => go('cottage', 'exterior')} />
        ) : (
          <CottageExterior
            onEnter={() => go('cottage', 'interior')}
            onBack={() => go('arcade')}
            onForward={forward === 'farm' ? () => go('farm') : undefined}
          />
        );
      case 'farm':
        return (
          <FarmView
            onBack={() => go('cottage')}
            onLeave={() => (forward === 'museum' ? go('museum') : notify(t('not_available_yet')))}
          />
        );
      case 'museum':
        return place!.view === 'interior' ? (
          <MuseumHall
            onLeave={() => go('museum', 'exterior')}
            onMap={() => {
              const line = lastBeat?.dialogueGroupId;
              setFreedom(
                line
                  ? (dialogueLines.find((d) => d.groupId === line && d.locale === locale)?.text ??
                      dialogueLines.find((d) => d.groupId === line && d.locale === 'en')?.text ??
                      '')
                  : '',
              );
              go('map', 'exterior');
            }}
          />
        ) : (
          <MuseumApproach onEnter={() => go('museum', 'interior')} onBack={() => go('farm')} />
        );
      case 'map':
        return (
          <MapView
            onEnterPlace={enterFromMap}
            freedomLine={freedom}
            currentLocation={mapOrigin.current}
          />
        );
    }
  }

  const replayStep = journey!.phase === 'replay' && beat ? beat.requiredInteractionId : '';

  return (
    <div
      className={styles.world}
      data-testid="world-experience"
      data-place={place.id}
      data-view={place.view}
      data-phase={journey!.phase}
    >
      <WorldEnvProvider value={env}>
        {view()}
        <div className={styles.hud} data-testid="keys-hud" role="list" aria-label={t('keys')}>
          {journey!.keys.map((key) => (
            <span
              key={key.keyTypeId}
              role="listitem"
              className={styles.keyChip}
              data-testid={`key-${key.keyTypeId}`}
              data-empty={key.quantity === 0}
              title={key.shape}
            >
              {(() => {
                const icon = env.icons.find((i) => i.iconId === key.iconId)?.mediaRef;
                return icon ? (
                  <img className={styles.keyImg} src={icon} alt="" />
                ) : (
                  <span aria-hidden="true">🗝️</span>
                );
              })()}
              <span>{key.quantity}</span>
            </span>
          ))}
        </div>
        <Ambience
          assetId={place.id === 'church' ? null : (ambient[place.id] ?? null)}
          paused={walkman.duckPercent !== null}
        />
        <WalkmanDock lifted={!!narrationBeat || !!freedom || !!replayStep} />
        {journey!.mapUnlocked && place.id !== 'map' && (
          <button
            type="button"
            className={styles.mapButton}
            data-testid="open-map"
            aria-label={t('map_open')}
            title={t('map_open')}
            onClick={() => {
              mapOrigin.current = place.id === 'beach' ? beachLocation.current : place.id;
              go('map');
            }}
          >
            <SceneIcon slot="map" icons={env.icons} className={styles.mapIcon} fixedDirection />
          </button>
        )}
        <button
          type="button"
          className={styles.achievementsButton}
          data-testid="open-achievements"
          aria-label={t('achievements_open')}
          title={t('achievements_open')}
          onClick={() => setAchievementsOpen(true)}
        >
          <span aria-hidden="true">🏆</span>
        </button>
        {achievementsOpen && <AchievementsPanel onClose={() => setAchievementsOpen(false)} />}
        {ocean && <OceanView onClose={() => setOcean(false)} />}
        {/* Defers the automatic invitation/entry button while the Church is open, an Arcade game is
            active, or another WorldExperience-level overlay (achievements, ocean, the junction
            explainer, a narration beat) is already on screen — never stacked on top of one.
            BirthdayOverlay also observes scene-local dialogs, including mail/decor/Museum panels. */}
        <BirthdayOverlay
          deferred={
            place.id === 'church' ||
            activeGame ||
            achievementsOpen ||
            ocean ||
            Boolean(explain) ||
            Boolean(narrationBeat)
          }
        />
        {explain && (
          <Panel
            title={t('place_junction')}
            onClose={() => setExplain(null)}
            testId="world-explain"
          >
            <TextBlock text={t(explain)} testId="world-explain-text" />
          </Panel>
        )}
        {narrationBeat && (
          <BeatNarration
            key={narrationBeat.beatId}
            groupId={narrationBeat.dialogueGroupId}
            seenKey={narrationBeat.beatId}
            dialogue={env.dialogue}
            locale={locale}
            uiText={env.uiText}
          />
        )}
        {journey!.phase === 'replay_offer' && (
          <Panel title={t('replay_title')} onClose={() => undefined} testId="replay-offer">
            <TextBlock text={t('replay_title')} />
            <div className={styles.row}>
              <ActionButton
                testId="replay-start"
                onClick={async () => {
                  const r = await worldApi.post<JourneyStateResponse>('/journey/replay', {
                    action: 'start',
                  });
                  if (r.status === 'online') {
                    setJourney(r.data);
                    setPlace(initialPlace(r.data));
                  }
                }}
              >
                {t('replay_start')}
              </ActionButton>
              <ActionButton
                quiet
                testId="replay-skip"
                onClick={async () => {
                  const r = await worldApi.post<JourneyStateResponse>('/journey/replay', {
                    action: 'skip',
                  });
                  if (r.status === 'online') setJourney(r.data);
                }}
              >
                {t('replay_skip')}
              </ActionButton>
            </div>
          </Panel>
        )}
        {replayStep && (
          <div className={styles.narration} style={{ pointerEvents: 'none' }}>
            <ActionButton
              testId="replay-continue"
              onClick={async () => {
                const r = await worldApi.post<JourneyStateResponse>('/journey/ack', {
                  interactionId: replayStep,
                });
                if (r.status === 'online') {
                  setJourney(r.data);
                  if (r.data.completed && r.data.phase === 'free') go('map');
                  else setPlace(initialPlace(r.data));
                } else notify(r.message);
              }}
            >
              {t('continue')}
            </ActionButton>
          </div>
        )}
        {pending > 0 && (
          <p className={styles.pending} role="status" data-testid="world-pending">
            {t('working')}
          </p>
        )}
        {toast && (
          <p className={styles.toast} role="status" data-testid="world-toast">
            {toast}
          </p>
        )}
      </WorldEnvProvider>
    </div>
  );
}
