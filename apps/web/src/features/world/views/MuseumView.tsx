import { useCallback, useEffect, useState } from 'react';
import type {
  JourneyStateResponse,
  MuseumExhibitView,
  MuseumStateResponse,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { resolveUiText } from '../../../i18n/resolveText';
import { useWorld } from '../WorldContext';
import { pendingCompletion, worldApi } from '../worldClient';
import {
  ActionButton,
  CaptionedHotspot,
  Companion,
  CompanionHint,
  Panel,
  PlaceTitle,
  Stage,
  TextBlock,
  usePlaneRect,
} from '../ui';
import styles from '../world.module.css';

function useMuseum() {
  const env = useWorld();
  const [state, setState] = useState<MuseumStateResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    setFailed(false);
    const r = await worldApi.get<MuseumStateResponse>('/museum');
    if (r.status === 'online') setState(r.data);
    else setFailed(true);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const apply = useCallback(
    async (next: MuseumStateResponse) => {
      setState(next);
      env.showRewards(next.rewards);
      await env.refreshJourney();
    },
    [env],
  );
  return { state, apply, reload, failed };
}

/** The Everkeep's road gate: server-verified keys and the (design-pending) key-socket puzzle. */
export function MuseumApproach({ onEnter, onBack }: { onEnter: () => void; onBack: () => void }) {
  const env = useWorld();
  const { state, apply, reload, failed } = useMuseum();
  const [seated, setSeated] = useState<string[]>([]);
  const [panel, setPanel] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState('');

  const requirement = state?.entrance.requirement ?? env.journey.museumRequirement;
  const allOwned = requirement.every((r) => r.owned >= r.required);
  const complete = requirement.length > 0 && requirement.every((r) => seated.includes(r.keyTypeId));

  async function solve() {
    const r = await worldApi.post<MuseumStateResponse>('/museum/puzzle', { keyTypeIds: seated });
    if (r.status === 'online') await apply(r.data);
    else env.notify(r.message);
  }
  async function open() {
    const r = await worldApi.post<MuseumStateResponse>('/museum/verify');
    if (r.status === 'online') {
      await apply(r.data);
      onEnter();
    } else setFeedback(r.retryable ? env.t('saving_retry') : r.message);
  }

  async function checkSavedReward() {
    setChecking(true);
    setFeedback('');
    const r = await worldApi.post<{ reward: WorldRewardView | null }>(
      '/arcade/recover-intro-reward',
    );
    if (r.status === 'online') {
      const reward = r.data.reward;
      setFeedback(
        !reward
          ? env.t('arcade_intro_required')
          : reward.applied || reward.reason === 'already_claimed'
            ? env.t('reward_check_done')
            : env.t('reward_unavailable'),
      );
      if (reward) env.showRewards([reward]);
      await env.refreshJourney();
      await reload();
    } else setFeedback(r.retryable ? env.t('saving_retry') : r.message);
    setChecking(false);
  }
  return (
    <Stage theme="museum" assetId="museum_exterior_scene" testId="museum-exterior">
      <PlaceTitle text={env.t('place_museum')} />
      <Companion />
      <CompanionHint locationId="museum" />
      <CaptionedHotspot
        testId="museum-gate"
        x={50}
        y={56}
        label={env.t('museum_road_gate')}
        onClick={() => {
          void reload();
          setPanel(true);
        }}
      />
      {state?.entrance.open && (
        <CaptionedHotspot
          testId="museum-door"
          x={50}
          y={40}
          label={env.t('museum_open_door')}
          onClick={onEnter}
        />
      )}
      <CaptionedHotspot
        testId="museum-back"
        x={8}
        y={90}
        slot="walk_back"
        label={env.t('back')}
        onClick={onBack}
      />
      {panel && (
        <Panel
          title={env.t('museum_road_gate')}
          onClose={() => setPanel(false)}
          testId="museum-gate-panel"
          wide
        >
          {failed && (
            <div role="alert">
              <TextBlock text={env.t('load_failed')} />
              <ActionButton testId="museum-load-retry" onClick={() => void reload()}>
                {env.t('try_again')}
              </ActionButton>
            </div>
          )}
          <TextBlock
            text={
              !state
                ? env.t(failed ? 'load_failed' : 'working')
                : allOwned
                  ? env.t('museum_seat_keys')
                  : env.t('museum_need_keys')
            }
            testId="museum-gate-status"
          />
          {!allOwned && (
            <>
              <TextBlock text={env.t('museum_key_help')} />
              <ActionButton
                testId="museum-retry-rewards"
                disabled={checking}
                onClick={() => void checkSavedReward()}
              >
                {env.t(checking ? 'working' : 'check_saved_reward')}
              </ActionButton>
            </>
          )}
          {feedback && (
            <p role="status" data-testid="museum-reward-feedback">
              {feedback}
            </p>
          )}
          <div className={styles.sockets}>
            {requirement.map((r) => {
              const isSeated = state?.entrance.puzzleSolved || seated.includes(r.keyTypeId);
              return (
                <button
                  key={r.keyTypeId}
                  type="button"
                  className={styles.socket}
                  data-seated={isSeated}
                  data-testid={`socket-${r.keyTypeId}`}
                  disabled={r.owned < r.required || state?.entrance.puzzleSolved}
                  onClick={() =>
                    setSeated((s) =>
                      s.includes(r.keyTypeId)
                        ? s.filter((k) => k !== r.keyTypeId)
                        : [...s, r.keyTypeId],
                    )
                  }
                >
                  {r.keyTypeId.replace('key_', '')}
                  <br />
                  {isSeated ? env.t('museum_seated') : `${r.owned}/${r.required}`}
                </button>
              );
            })}
          </div>
          {!state?.entrance.puzzleSolved && state?.entrance.puzzleRequired && (
            <ActionButton
              testId="museum-solve"
              disabled={!state || failed || !complete}
              onClick={() => void solve()}
            >
              {env.t('museum_seat_keys')}
            </ActionButton>
          )}
          <ActionButton
            testId="museum-verify"
            disabled={
              !state ||
              failed ||
              !allOwned ||
              (state.entrance.puzzleRequired && !state.entrance.puzzleSolved)
            }
            onClick={() => void open()}
          >
            {env.t('museum_open_door')}
          </ActionButton>
        </Panel>
      )}
    </Stage>
  );
}

/** A localized label from the Sheet's UI text, or a generic localized word — never the raw content id. */
function useLabel() {
  const env = useWorld();
  return (textIds: (string | undefined)[], fallback: string): string => {
    for (const id of textIds) {
      if (!id) continue;
      const resolved = resolveUiText(env.uiText, id, env.locale);
      if (!resolved.isMissing) return resolved.text;
    }
    return fallback;
  };
}

function ExhibitPanel({
  exhibit,
  title,
  onClose,
  onViewed,
}: {
  exhibit: MuseumExhibitView;
  title: string;
  onClose: () => void;
  onViewed: (s: MuseumStateResponse) => void;
}) {
  const env = useWorld();
  const [page, setPage] = useState(exhibit.bookPage);
  // Failing to load is its own state (with a retry), distinct from an exhibit that is empty or not written yet.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void worldApi
      .post<MuseumStateResponse>('/museum/exhibit', { exhibitId: exhibit.exhibitId })
      .then((r) => {
        if (cancelled) return;
        if (r.status === 'online') onViewed(r.data);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibit.exhibitId, attempt]);
  async function turn(delta: number) {
    const next = Math.max(0, page + delta);
    setPage(next);
    const r = await worldApi.post<MuseumStateResponse>('/museum/exhibit', {
      exhibitId: exhibit.exhibitId,
      page: next,
    });
    if (r.status === 'online') onViewed(r.data);
  }
  return (
    <Panel title={title} onClose={onClose} testId="exhibit-panel" wide>
      {failed ? (
        <div role="alert" data-testid="exhibit-load-failed">
          <TextBlock text={env.t('load_failed')} />
          <ActionButton
            testId="exhibit-retry"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {env.t('try_again')}
          </ActionButton>
        </div>
      ) : exhibit.exhibitType === 'pdf_book' ? (
        exhibit.pdfRef ? (
          <>
            <object
              data={`${exhibit.pdfRef}#page=${page + 1}`}
              type="application/pdf"
              width="100%"
              height="380"
              data-testid="pdf-reader"
            >
              <TextBlock text={env.t('museum_book_missing')} />
            </object>
            <div className={styles.row}>
              <ActionButton
                quiet
                testId="book-prev"
                disabled={page === 0}
                onClick={() => void turn(-1)}
              >
                {env.t('museum_book_prev')}
              </ActionButton>
              <ActionButton quiet testId="book-next" onClick={() => void turn(1)}>
                {env.t('museum_book_next')}
              </ActionButton>
            </div>
          </>
        ) : (
          <TextBlock text={env.t('museum_book_missing')} testId="book-missing" />
        )
      ) : exhibit.exhibitType === 'archive_portal' ? (
        exhibit.archiveUrl ? (
          <>
            <TextBlock text={env.t('museum_archive_intro')} />
            <ActionButton
              testId="archive-open-link"
              onClick={() => {
                // Opens in a new tab/window — the current session, its
                // progress, and this panel are never navigated away from.
                window.open(exhibit.archiveUrl!, '_blank', 'noopener,noreferrer');
              }}
            >
              {env.t('museum_archive_open_link')}
            </ActionButton>
          </>
        ) : (
          <TextBlock text={env.t('museum_archive_missing')} testId="archive-missing" />
        )
      ) : (
        <>
          {exhibit.imageRefs.map((src) => (
            <img
              key={`${src}-${attempt}`}
              src={src}
              alt=""
              style={{ maxWidth: '100%', borderRadius: 10 }}
              onError={() => setFailed(true)}
            />
          ))}
          {exhibit.audioRef && <audio controls src={exhibit.audioRef} preload="none" />}
          {exhibit.imageRefs.length === 0 && !exhibit.audioRef && (
            <TextBlock text={env.t('content_pending')} />
          )}
        </>
      )}
    </Panel>
  );
}

/** The relic in the hall: the registered `museum_artifact` prop on the painted floor, else the plain glowing orb. */
function ArtifactButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  const env = useWorld();
  const art = env.assetRef('museum_artifact');
  const box = usePlaneRect('artifact');
  if (!art || !box) {
    return (
      <button
        type="button"
        className={styles.artifact}
        data-testid="museum-artifact"
        aria-label={label}
        onClick={onOpen}
      />
    );
  }
  return (
    <button
      type="button"
      className={styles.artifactArt}
      style={box}
      data-testid="museum-artifact"
      aria-label={label}
      onClick={onOpen}
    >
      <img src={art} alt="" />
    </button>
  );
}

/** The Central Hall (M13): living progress map, mysterious artifact, progressive wings. */
export function MuseumHall({ onLeave, onMap }: { onLeave: () => void; onMap: () => void }) {
  const env = useWorld();
  const { state, apply, reload } = useMuseum();
  const [panel, setPanel] = useState<'wings' | 'progress' | null>(null);
  const [exhibit, setExhibit] = useState<MuseumExhibitView | null>(null);
  const label = useLabel();
  const exhibitTitle = (e: MuseumExhibitView, n: number) =>
    label([e.displayNameTextId], `${env.t('museum_exhibit_untitled')} ${n}`);
  const beat = env.journey.currentBeat;
  const receiving = beat?.requiredInteractionId === 'map_receive' && env.journey.phase !== 'free';

  async function look() {
    const r = await worldApi.post<MuseumStateResponse>('/museum/artifact');
    if (r.status === 'online') await apply(r.data);
  }
  async function receiveMap() {
    const r = await worldApi.post<JourneyStateResponse>('/journey/ack', {
      interactionId: 'map_receive',
    });
    if (r.status === 'online') {
      pendingCompletion.clear(env.userId);
      env.applyJourney(r.data);
      onMap();
    } else if (r.retryable) {
      // The Sheet is briefly unavailable: remember the completion locally and let the story go on.
      pendingCompletion.set(env.userId);
      onMap();
    } else env.notify(r.message);
  }

  return (
    <Stage theme="hall" assetId="museum_hall_scene" testId="museum-hall">
      <PlaceTitle text={env.t('museum_central_hall')} />
      <Companion />
      <CompanionHint locationId="museum" />
      <ArtifactButton label={env.t('museum_artifact')} onOpen={() => void look()} />
      <CaptionedHotspot
        testId="hall-progress"
        x={26}
        y={62}
        label={env.t('museum_progress')}
        onClick={() => {
          void reload();
          setPanel('progress');
        }}
      />
      <CaptionedHotspot
        testId="hall-wings"
        atEdge
        x={74}
        y={62}
        label={env.t('museum_wings')}
        onClick={() => {
          void reload();
          setPanel('wings');
        }}
      />
      <CaptionedHotspot
        testId="hall-wings-east"
        atEdge
        x={74}
        y={62}
        label={env.t('museum_wings')}
        hideCaption
        onClick={() => {
          void reload();
          setPanel('wings');
        }}
      />
      <CaptionedHotspot
        testId="hall-leave"
        x={50}
        y={92}
        slot="walk_back"
        label={env.t('leave')}
        onClick={onLeave}
      />
      {receiving && state?.hall.artifactViewed && (
        <Panel title={env.t('place_map')} onClose={() => undefined} testId="map-receive-panel">
          <TextBlock text={env.t('map_receive')} />
          <ActionButton testId="map-receive" onClick={() => void receiveMap()}>
            {env.t('map_receive')}
          </ActionButton>
        </Panel>
      )}
      {panel === 'progress' && (
        <Panel
          title={env.t('museum_progress')}
          onClose={() => setPanel(null)}
          testId="hall-progress-panel"
        >
          <ul className={styles.list}>
            {state?.hall.progress.map((p) => (
              <li
                key={p.locationId}
                className={styles.card}
                data-testid={`progress-${p.locationId}`}
                data-owned={p.owned}
              >
                {env.t(`place_${p.locationId}` as never)} {p.owned ? '🗝️' : '·'}{' '}
                {p.visited ? '✓' : ''}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {panel === 'wings' && (
        <Panel
          title={env.t('museum_wings')}
          onClose={() => setPanel(null)}
          testId="hall-wings-panel"
          wide
        >
          {state?.wings.map((wing, wingIndex) => (
            <section
              key={wing.wingId}
              data-testid={`wing-${wing.wingId}`}
              data-locked={wing.locked}
            >
              <h3 className={styles.muted}>
                {label(
                  [`museum_${wing.wingId}`, wing.wingId, `wing_${wing.wingId}`],
                  `${env.t('museum_wing_untitled')} ${wingIndex + 1}`,
                )}
              </h3>
              {wing.locked ? (
                // One closed message for the whole wing — never repeated per exhibit.
                <TextBlock
                  text={env.t('museum_wing_locked')}
                  testId={`wing-locked-${wing.wingId}`}
                />
              ) : (
                <ul className={styles.list}>
                  {wing.exhibits.map((e, i) => (
                    <li
                      key={e.exhibitId}
                      className={styles.card}
                      data-locked={e.locked}
                      data-testid={`exhibit-${e.exhibitId}`}
                    >
                      {e.locked ? (
                        <TextBlock
                          text={
                            e.secret ? env.t('museum_empty_slot') : env.t('museum_exhibit_locked')
                          }
                        />
                      ) : (
                        <ActionButton
                          quiet
                          testId={`exhibit-open-${e.exhibitId}`}
                          onClick={() => setExhibit(e)}
                        >
                          {env.t('museum_open_exhibit')} · {exhibitTitle(e, i + 1)}
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </Panel>
      )}
      {exhibit && (
        <ExhibitPanel
          exhibit={exhibit}
          title={exhibitTitle(exhibit, 1)}
          onClose={() => setExhibit(null)}
          onViewed={(s) => void apply(s)}
        />
      )}
    </Stage>
  );
}
