import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArcadeAttemptResponse,
  ArcadeGameView,
  ArcadeStateResponse,
} from '@veoullas-world/contracts';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import { activeGameStore } from '../../birthday/activeGameStore';
import { resolveUiText } from '../../../i18n/resolveText';
import { GAME_COMPONENTS, SYMBOL_ICON_IDS, type GameResult } from '../games/games';
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

/**
 * One cabinet. On the painting it is a transparent tap target over the painted cabinet (its state shown by a small
 * tag and a dim veil, never a drawn replacement); on the temporary visual it keeps the plain CSS cabinet. The
 * cabinet count and which games are enabled come from the server, not from the painting.
 */
function Cabinet({
  index,
  game,
  name,
  onPick,
}: {
  index: number;
  game: ArcadeGameView | null;
  /** The configured, localized game name shown on the cabinet screen. */
  name: string;
  onPick: () => void;
}) {
  const env = useWorld();
  const box = usePlaneRect(`cabinet-${index + 1}`);
  const cls = box ? styles.paintedCabinet : styles.cabinet;
  const tagClass = box ? styles.cabinetTag : undefined;
  const stateText = !game?.installed
    ? env.t('arcade_empty_slot')
    : game.unlocked
      ? env.t('arcade_play')
      : env.t('arcade_locked_cost').replace('{n}', String(game.keyCost.quantity));
  return (
    <button
      type="button"
      className={cls}
      style={box}
      data-testid={`cabinet-${index + 1}`}
      data-locked={game ? !game.unlocked : undefined}
      data-empty={!game?.installed}
      disabled={!game?.installed}
      aria-label={game?.installed ? `${name} — ${stateText}` : stateText}
      onClick={onPick}
    >
      {game?.installed && (
        <span
          className={`${tagClass ?? ''} ${styles.cabinetName}`}
          data-testid={`cabinet-name-${index + 1}`}
        >
          {name}
        </span>
      )}
      <span className={tagClass} data-testid={`cabinet-state-${index + 1}`}>
        {stateText}
      </span>
      {game?.installed && game.personalBest !== null ? (
        <span className={tagClass}>
          {env.t('arcade_best')}: {game.personalBest}
        </span>
      ) : null}
    </button>
  );
}

/** VARcade (M10): one row of five cabinets, adaptive difficulty from the server, SFX only, reduced Walkman. */
export function ArcadeView({ onLeave }: { onLeave: () => void }) {
  const env = useWorld();
  const [state, setState] = useState<ArcadeStateResponse | null>(null);
  const [selected, setSelected] = useState<ArcadeGameView | null>(null);
  const [playing, setPlaying] = useState<ArcadeGameView | null>(null);
  const [outcome, setOutcome] = useState<(GameResult & { best: boolean }) | null>(null);
  const [hint, setHint] = useState(false);
  const [board, setBoard] = useState(false);
  const attempt = useRef(0);
  const [round, setRound] = useState(0);
  const { walkman, locale } = env;
  /** Mirrors `playing`, read inside `finish()`'s async continuation so a slow save can never stamp a
   * stale outcome onto whatever game the player has since switched to. */
  const playingRef = useRef<ArcadeGameView | null>(null);
  playingRef.current = playing;

  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    setLoadFailed(false);
    const r = await worldApi.postIdempotent<ArcadeStateResponse>('/arcade/enter');
    if (r.status === 'online') setState(r.data);
    else setLoadFailed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // The Walkman keeps playing but quieter for the duration of a game, then is restored.
  useEffect(() => {
    if (!playing) return;
    walkman.duck(playing.walkmanVolumePercent);
    const timer = window.setTimeout(() => setHint(true), 25_000);
    return () => {
      walkman.duck(null);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Lets the birthday invitation defer itself while a game is actually being played (never while
  // just browsing cabinets) — see `activeGameStore`. Always cleared on unmount/leaving the view.
  useEffect(() => {
    activeGameStore.setActive(Boolean(playing));
    return () => activeGameStore.setActive(false);
  }, [playing]);

  const finish = useCallback(
    async (game: ArcadeGameView, result: GameResult) => {
      // The player already knows how it ended: show that at once and record it in the background, so
      // the board never resets (or freezes) while the save is in flight.
      setOutcome({ ...result, best: false });
      const r = await worldApi.post<ArcadeAttemptResponse>('/arcade/attempt', {
        gameId: game.gameId,
        clientAttemptId: `a${Date.now().toString(36)}${attempt.current++}`,
        score: Math.round(result.score),
        result: result.result,
      });
      // A failed save is announced by the world (unconfirmed / retry) and reconciled with the server.
      if (r.status !== 'online') return;
      setState(r.data.state);
      // The player may have already closed this result and started a different cabinet while the
      // save was in flight; a slow response must never overwrite that newer game's outcome.
      if (playingRef.current?.gameId === game.gameId)
        setOutcome({ ...result, best: r.data.personalBest });
      env.showRewards(r.data.state.rewards);
      if (r.data.state.rewards?.length) await env.refreshJourney();
    },
    [env],
  );

  async function unlock(game: ArcadeGameView) {
    const r = await worldApi.post<ArcadeStateResponse>('/arcade/unlock', { gameId: game.gameId });
    if (r.status === 'online') {
      setState(r.data);
      setSelected(r.data.games.find((g) => g.gameId === game.gameId) ?? null);
    } else env.notify(env.t('arcade_not_enough'));
  }

  const games = state?.games ?? [];
  const slots = Array.from(
    { length: state?.supportedSlots ?? 5 },
    (_, i) => games.find((g) => g.cabinetSlot === i + 1) ?? null,
  );
  const Game = playing ? GAME_COMPONENTS[playing.family] : undefined;
  /** The configured, localized game name (Sheet text); never a bare slot number. */
  const gameName = (game: ArcadeGameView) => {
    const named = game.displayNameTextId
      ? resolveUiText(env.uiText, game.displayNameTextId, locale)
      : null;
    return named && !named.isMissing ? named.text : env.t('arcade_game_untitled');
  };
  const faceArt = (symbol: string) => {
    const iconId = SYMBOL_ICON_IDS[symbol];
    return (iconId && env.icons.find((i) => i.iconId === iconId)?.mediaRef) || null;
  };

  return (
    <Stage theme="arcade" assetId="arcade_interior_scene" testId="arcade-interior">
      <PlaceTitle text={env.t('place_arcade')} />
      <Companion />
      <CompanionHint locationId="arcade" />
      <div className={styles.cabinets} data-testid="arcade-cabinets">
        {slots.map((game, i) => (
          <Cabinet
            key={i}
            index={i}
            game={game}
            name={game ? gameName(game) : ''}
            onPick={() => {
              if (!game) return;
              setOutcome(null);
              setHint(false);
              if (game.unlocked) setPlaying(game);
              else setSelected(game);
            }}
          />
        ))}
      </div>
      {loadFailed && !state && (
        <div className={styles.startNotice} role="alert" data-testid="arcade-load-failed">
          <p>{env.t('saving_retry')}</p>
          <ActionButton testId="arcade-retry" onClick={() => void load()}>
            {env.t('try_again')}
          </ActionButton>
        </div>
      )}
      <CaptionedHotspot
        testId="arcade-scoreboard"
        x={50}
        y={20}
        label={env.t('arcade_scoreboard')}
        onClick={() => setBoard(true)}
      />
      <CaptionedHotspot
        testId="arcade-leave"
        x={50}
        y={90}
        slot="walk_back"
        label={env.t('leave')}
        onClick={onLeave}
      />
      <p className={styles.sfxNote} data-testid="arcade-sfx-note">
        {env.t('arcade_sfx_only')}
      </p>

      {selected && (
        <Panel
          title={gameName(selected)}
          onClose={() => setSelected(null)}
          testId="arcade-unlock-panel"
        >
          <TextBlock
            text={`${env.t('arcade_cost')}: ${selected.keyCost.quantity} · ${state?.tokens ?? 0}`}
          />
          <ActionButton
            testId="arcade-unlock"
            disabled={!selected.canAfford}
            onClick={() => void unlock(selected)}
          >
            {env.t('arcade_unlock')}
          </ActionButton>
          {!selected.canAfford && (
            <TextBlock text={env.t('arcade_not_enough')} testId="arcade-not-enough" />
          )}
          {selected.unlocked && (
            <ActionButton
              testId="arcade-start"
              onClick={() => {
                setPlaying(selected);
                setSelected(null);
              }}
            >
              {env.t('arcade_play')}
            </ActionButton>
          )}
        </Panel>
      )}

      {playing && (
        <Panel
          title={gameName(playing)}
          onClose={() => setPlaying(null)}
          testId="arcade-game-panel"
        >
          {!outcome && Game && (
            <Game
              key={`${playing.gameId}-${round}`}
              gameId={playing.gameId}
              difficulty={playing.difficulty}
              sfx={playing.sfxEnabled}
              faceArt={faceArt}
              labels={{
                moves: env.t('arcade_moves'),
                score: env.t('arcade_score'),
                time: env.t('arcade_time'),
                level: env.t('arcade_level'),
              }}
              onFinish={(result) => void finish(playing, result)}
            />
          )}
          {!outcome && !Game && <TextBlock text={env.t('content_pending')} />}
          {hint && !outcome && <TextBlock text={env.t('arcade_hint')} testId="var-hint" />}
          {outcome && (
            <>
              <TextBlock
                text={outcome.result === 'win' ? env.t('arcade_win') : env.t('arcade_lose')}
                testId="arcade-outcome"
              />
              <p className={styles.muted}>
                {env.t('arcade_score')}: {outcome.score}
                {outcome.best ? ' ★' : ''}
              </p>
              <ActionButton
                testId="arcade-again"
                onClick={() => {
                  setOutcome(null);
                  setHint(false);
                  setRound((n) => n + 1);
                  const fresh = state?.games.find((g) => g.gameId === playing.gameId);
                  if (fresh) setPlaying(fresh);
                }}
              >
                {env.t('arcade_again')}
              </ActionButton>
            </>
          )}
        </Panel>
      )}

      {board && (
        <Panel
          title={env.t('arcade_scoreboard')}
          onClose={() => setBoard(false)}
          testId="arcade-board"
          wide
        >
          <ul className={styles.list}>
            {games
              .filter((g) => g.installed)
              .map((g) => (
                <li key={g.gameId} className={styles.card}>
                  <p className={styles.cardTitle}>{gameName(g)}</p>
                  <p className={styles.muted}>
                    {env.t('arcade_best')}: {g.personalBest ?? '—'} · {env.t('arcade_attempts')}:{' '}
                    {g.attempts} · {env.t('arcade_level')}: {g.difficulty}
                  </p>
                  {g.recent.length > 0 && (
                    <p className={styles.muted}>
                      {env.t('arcade_recent')}: {g.recent.map((a) => a.score).join(', ')}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </Panel>
      )}
      <span hidden data-testid="arcade-locale">
        {locale}
      </span>
    </Stage>
  );
}
