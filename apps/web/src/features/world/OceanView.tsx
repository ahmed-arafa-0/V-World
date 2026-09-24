import { useEffect, useRef, useState } from 'react';
import { useWorld } from './WorldContext';
import {
  loadYouTubeIframeApi,
  YT_EMBED_RESTRICTED_ERROR_CODES,
  YT_PLAYER_STATE,
  type YTPlayer,
} from './youtubeIframeApi';
import styles from './world.module.css';

/** Verified 2026-09-23 by real embedded playback + YouTube oEmbed metadata: bright turquoise water, daytime (title: "Turquoise Ocean off Seychelles Island"). */
export const OCEAN_DAYTIME_VIDEO_ID = '8HDjaAV_12s';
/** Verified 2026-09-23 by real embedded playback + YouTube oEmbed metadata: deep-orange sunset (title: "Deep Orange Sunset on a Remote Beach"). */
export const OCEAN_SUNSET_VIDEO_ID = 'C_Edf-nAc6g';
/**
 * The eye-level ocean viewer defaults to the daytime clip. A selectable day/sunset toggle needs
 * explicit runtime/config support nobody has asked for yet — both verified ids are exported so that
 * later work never has to re-verify which is which.
 */
export const OCEAN_VIDEO_ID = OCEAN_DAYTIME_VIDEO_ID;

function posterUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** A start point inside `[0, duration)`, leaving a short tail so the loop never begins at the very end. */
export function randomStartSeconds(duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const tail = Math.min(2, duration * 0.1);
  const usable = duration - tail;
  if (!(usable > 0)) return null;
  return Math.random() * usable;
}

type ViewState = 'loading' | 'playing' | 'blocked' | 'restricted' | 'failed';

/** How long to wait after calling playVideo() before assuming autoplay was blocked. */
const AUTOPLAY_GRACE_MS = 1500;

/**
 * Immersive eye-level ocean via the official YouTube IFrame Player API (Ahmed's decision,
 * 2026-09-23 — a YouTube provider authorized for this viewer only; the Map's top-down
 * `map_ocean_loop` is untouched and still served through the Drive/media-gateway pipeline). The
 * player is created only once this view mounts (the beach shell marker is the only entry point) and
 * destroyed on close, so nothing keeps playing or buffering in the background.
 */
export function OceanView({ onClose }: { onClose: () => void }) {
  const env = useWorld();
  const videoId = OCEAN_VIDEO_ID;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [attempt, setAttempt] = useState(0);
  const back = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    back.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Loads and creates the player only when this view is open; a retry (attempt++) tears down and
  // recreates it rather than reusing a failed instance.
  useEffect(() => {
    setState('loading');
    let cancelled = false;
    let autoplayTimer: number | null = null;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        const player = new YT.Player(containerRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 1, // Preserves the existing silent-ocean-loop audio behavior; Walkman/Church audio rules are unaffected.
            controls: 1,
            playsinline: 1,
            loop: 1,
            playlist: videoId, // The documented single-video-loop trick; keeps the complete video, never clips it.
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const duration = event.target.getDuration();
              const at = randomStartSeconds(duration);
              if (at !== null) event.target.seekTo(at, true);
              event.target.playVideo();
              autoplayTimer = window.setTimeout(() => {
                if (!cancelled && playerRef.current?.getPlayerState() !== YT_PLAYER_STATE.PLAYING) {
                  setState('blocked');
                }
              }, AUTOPLAY_GRACE_MS);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (event.data === YT_PLAYER_STATE.PLAYING) setState('playing');
            },
            onError: (event) => {
              if (cancelled) return;
              setState(YT_EMBED_RESTRICTED_ERROR_CODES.has(event.data) ? 'restricted' : 'failed');
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });

    return () => {
      cancelled = true;
      if (autoplayTimer !== null) window.clearTimeout(autoplayTimer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId, attempt]);

  // The poster covers only the brief window before the player has actually started rendering
  // frames; once blocked/playing/erroring, YouTube's own UI is visible underneath and must not be
  // covered by anything of ours.
  const showPoster = state === 'loading';

  return (
    <div
      className={styles.ocean}
      role="dialog"
      aria-modal="true"
      aria-label={env.t('ocean_look')}
      data-testid="ocean-view"
      data-state={state}
    >
      {showPoster && (
        <img
          src={posterUrl(videoId)}
          alt=""
          aria-hidden="true"
          className={styles.oceanVideo}
          data-testid="ocean-poster"
        />
      )}
      <div ref={containerRef} className={styles.oceanVideo} data-testid="ocean-player" />

      {state === 'loading' && (
        <p className={styles.oceanNote} role="status" data-testid="ocean-loading">
          {env.t('ocean_loading')}
        </p>
      )}
      {state === 'blocked' && (
        <button
          type="button"
          className={styles.actionButton}
          data-testid="ocean-play"
          onClick={() => playerRef.current?.playVideo()}
        >
          {env.t('cafe_play')}
        </button>
      )}
      {(state === 'restricted' || state === 'failed') && (
        <div className={styles.oceanNote} role="alert" data-testid="ocean-failed">
          <p>{env.t(state === 'restricted' ? 'ocean_restricted' : 'saving_retry')}</p>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
            data-testid="ocean-retry"
          >
            {env.t('try_again')}
          </button>
        </div>
      )}

      <button
        ref={back}
        type="button"
        className={styles.oceanBack}
        onClick={onClose}
        data-testid="ocean-close"
      >
        ← {env.t('back')}
      </button>
    </div>
  );
}
