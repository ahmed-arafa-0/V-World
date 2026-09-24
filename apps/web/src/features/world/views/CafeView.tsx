import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CafeSongView,
  CafeStateResponse,
  JourneyStateResponse,
  SongRequestResponse,
} from '@veoullas-world/contracts';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import {
  ActionButton,
  CaptionedHotspot,
  Companion,
  CompanionHint,
  Panel,
  PlaceTitle,
  Stage,
  TextBlock,
} from '../ui';
import styles from '../world.module.css';

function SongCard({
  song,
  state,
  onWalkman,
  onCard,
}: {
  song: CafeSongView;
  state: CafeStateResponse;
  onWalkman: () => void;
  onCard: () => void;
}) {
  const env = useWorld();
  const local = useRef<HTMLAudioElement | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  return (
    <li className={styles.card} data-testid={`song-${song.songId}`}>
      <div className={styles.row}>
        {song.coverRef ? (
          <img src={song.coverRef} alt="" width={48} height={48} style={{ borderRadius: 8 }} />
        ) : null}
        <div>
          <p className={styles.cardTitle}>{song.title}</p>
          <p className={styles.muted}>
            {song.artist}
            {song.isToday ? ` · ${env.t('cafe_today')}` : ''}
          </p>
        </div>
      </div>
      <div className={styles.row}>
        {song.audioRef && (
          <ActionButton
            quiet
            testId={`play-${song.songId}`}
            onClick={() => {
              if (local.current) {
                local.current.src = song.audioRef!;
                void local.current.play().catch(() => undefined);
              }
            }}
          >
            {env.t('cafe_play')}
          </ActionButton>
        )}
        {song.audioRef && song.availableInWalkman && state.walkmanUnlocked && (
          <ActionButton testId={`walkman-${song.songId}`} onClick={onWalkman}>
            {env.t('cafe_to_walkman')}
          </ActionButton>
        )}
        {song.explanation && (
          <ActionButton
            quiet
            testId={`why-${song.songId}`}
            onClick={() => {
              setShowWhy((v) => !v);
              onCard();
            }}
          >
            {env.t('cafe_why')}
          </ActionButton>
        )}
      </div>
      {showWhy && song.explanation ? (
        <TextBlock text={song.explanation} testId={`why-text-${song.songId}`} />
      ) : null}
      <audio ref={local} data-testid={`cafe-audio-${song.songId}`} />
    </li>
  );
}

/** Vinyl Café (M09): entering starts nothing; the gramophone opens the catalog and a tap starts a song. */
export function CafeView({
  onLeave,
  storyOpen = true,
}: {
  onLeave: () => void;
  /** False while the journey has not reached the Café: walking in is fine, its story activities wait. */
  storyOpen?: boolean;
}) {
  const env = useWorld();
  const [state, setState] = useState<CafeStateResponse | null>(null);
  const [panel, setPanel] = useState<'catalog' | 'request' | null>(null);
  const [requestText, setRequestText] = useState('');
  const [requested, setRequested] = useState(false);
  const [locked, setLocked] = useState(false);
  const { walkman, locale } = env;

  const load = useCallback(async () => {
    const r = await worldApi.get<CafeStateResponse>('/cafe', locale);
    if (r.status === 'online') setState(r.data);
  }, [locale]);
  useEffect(() => {
    void load();
  }, [load]);

  // Local gramophone previews stop when the panel closes.
  useEffect(() => {
    if (panel === null)
      document
        .querySelectorAll<HTMLAudioElement>('[data-testid^="cafe-audio-"]')
        .forEach((a) => a.pause());
  }, [panel]);

  async function openGramophone() {
    // Open the catalog straight away with what is already loaded; the visit is recorded (and any key
    // paid) in the background, and the catalog refreshes when the server answers.
    setPanel('catalog');
    const r = await worldApi.postIdempotent<CafeStateResponse>('/cafe/gramophone', {}, locale);
    if (r.status === 'online') {
      setState(r.data);
      env.showRewards(r.data.rewards);
      if (r.data.rewards?.length) await env.refreshJourney();
    }
  }

  const beat = env.journey.currentBeat;
  const receiving =
    beat?.requiredInteractionId === 'walkman_receive' && env.journey.phase !== 'free';

  async function receiveWalkman() {
    const r = await worldApi.post<JourneyStateResponse>('/journey/ack', {
      interactionId: 'walkman_receive',
    });
    if (r.status === 'online') {
      env.applyJourney(r.data);
      walkman.hydrate(true, { track: walkman.track, playing: false });
      await load();
    }
  }

  async function send() {
    const r = await worldApi.post<SongRequestResponse>(
      '/cafe/request',
      {
        text: requestText,
        clientRequestId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      },
      locale,
    );
    if (r.status === 'online') {
      setRequested(true);
      setRequestText('');
    } else env.notify(r.message);
  }

  return (
    <Stage theme="cafe" assetId="cafe_interior_scene" testId="cafe-interior">
      <PlaceTitle text={env.t('place_cafe')} />
      <Companion />
      <CompanionHint locationId="cafe" />
      <CaptionedHotspot
        testId="cafe-gramophone"
        x={34}
        y={56}
        label={env.t('cafe_gramophone')}
        gated={!storyOpen}
        onClick={() => (storyOpen ? void openGramophone() : setLocked(true))}
      />
      <CaptionedHotspot
        testId="cafe-request"
        x={70}
        y={60}
        label={env.t('cafe_request')}
        gated={!storyOpen}
        onClick={() => {
          if (!storyOpen) return setLocked(true);
          setRequested(false);
          setPanel('request');
        }}
      />
      <CaptionedHotspot
        testId="cafe-leave"
        x={50}
        y={90}
        slot="walk_back"
        label={env.t('leave')}
        onClick={onLeave}
      />

      {locked && (
        <Panel title={env.t('place_cafe')} onClose={() => setLocked(false)} testId="cafe-locked">
          <TextBlock text={env.t('cafe_story_locked')} testId="cafe-locked-text" />
        </Panel>
      )}
      {receiving && state?.gramophoneOpened && (
        <Panel title={env.t('walkman')} onClose={() => undefined} testId="walkman-receive-panel">
          <TextBlock text={env.t('walkman_receive')} />
          <ActionButton testId="walkman-receive" onClick={() => void receiveWalkman()}>
            {env.t('continue')}
          </ActionButton>
        </Panel>
      )}

      {panel === 'catalog' && (
        <Panel
          title={env.t('cafe_gramophone')}
          onClose={() => setPanel(null)}
          testId="cafe-catalog"
          wide
        >
          {state && state.releases.length > 0 ? (
            state.releases.map((release) => (
              <section key={release.day}>
                <h3 className={styles.muted}>
                  {release.day === 'first_visit' ? env.t('cafe_first_visit') : release.day}
                </h3>
                <ul className={styles.list}>
                  {release.songs.map((song) => (
                    <SongCard
                      key={song.songId}
                      song={song}
                      state={state}
                      onCard={() =>
                        void worldApi.post('/cafe/card', { songId: song.songId }, locale)
                      }
                      onWalkman={() =>
                        song.audioRef &&
                        walkman.select(
                          { songId: song.songId, title: song.title, audioRef: song.audioRef },
                          true,
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <TextBlock text={env.t('cafe_no_songs')} testId="cafe-empty" />
          )}
        </Panel>
      )}
      {panel === 'request' && (
        <Panel
          title={env.t('cafe_request')}
          onClose={() => setPanel(null)}
          testId="cafe-request-panel"
        >
          <input
            className={styles.input}
            value={requestText}
            maxLength={200}
            placeholder={env.t('cafe_request_hint')}
            aria-label={env.t('cafe_request_hint')}
            onChange={(e) => setRequestText(e.target.value)}
            data-testid="cafe-request-input"
          />
          <ActionButton
            testId="cafe-request-send"
            disabled={requestText.trim().length === 0}
            onClick={() => void send()}
          >
            {env.t('cafe_request_send')}
          </ActionButton>
          {requested && <TextBlock text={env.t('cafe_request_sent')} testId="cafe-request-sent" />}
        </Panel>
      )}
    </Stage>
  );
}
