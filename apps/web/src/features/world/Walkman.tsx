import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CafeStateResponse } from '@veoullas-world/contracts';
import { useWorld } from './WorldContext';
import type { WalkmanTrack } from './useWalkman';
import { worldApi } from './worldClient';
import styles from './walkman.module.css';

/** The songs the Sheet allows on the Walkman: released Café songs flagged for it that have registered audio. */
export function walkmanTracksFrom(cafe: CafeStateResponse): WalkmanTrack[] {
  const seen = new Set<string>();
  const tracks: WalkmanTrack[] = [];
  for (const song of cafe.releases.flatMap((r) => r.songs)) {
    if (!song.audioRef || !song.availableInWalkman || seen.has(song.songId)) continue;
    seen.add(song.songId);
    tracks.push({ songId: song.songId, title: song.title, audioRef: song.audioRef });
  }
  return tracks;
}

export async function loadWalkmanPlaylist(locale: string): Promise<WalkmanTrack[] | null> {
  const cafe = await worldApi.get<CafeStateResponse>('/cafe', locale);
  return cafe.status === 'online' ? walkmanTracksFrom(cafe.data) : null;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const glyph = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const PlayIcon = () => (
  <Icon>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </Icon>
);
const PauseIcon = () => (
  <Icon>
    <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" />
  </Icon>
);
const PrevIcon = () => (
  <Icon>
    <path d="M7 5v14" {...glyph} />
    <path d="M18 5.5v13L9 12z" fill="currentColor" stroke="none" />
  </Icon>
);
const NextIcon = () => (
  <Icon>
    <path d="M17 5v14" {...glyph} />
    <path d="M6 5.5v13L15 12z" fill="currentColor" stroke="none" />
  </Icon>
);
const ShuffleIcon = () => (
  <Icon>
    <path
      d="M4 7h3.5c5 0 4 10 9 10H20M4 17h3.5c1.6 0 2.6-1 3.4-2.3M13 9c.8-1.2 1.9-2 3.5-2H20"
      {...glyph}
    />
    <path d="m18 4.5 2.5 2.5L18 9.5M18 14.5l2.5 2.5-2.5 2.5" {...glyph} />
  </Icon>
);
const RepeatIcon = ({ one }: { one: boolean }) => (
  <Icon>
    <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5" {...glyph} />
    <path d="m16.5 4 3 3-3 3M7.5 20l-3-3 3-3" {...glyph} />
    {one && <path d="M11 10.5l1.4-1v6" {...glyph} strokeWidth={1.7} />}
  </Icon>
);
const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <Icon>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" stroke="none" />
    {muted ? (
      <path d="m16 9.5 4 5M20 9.5l-4 5" {...glyph} />
    ) : (
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" {...glyph} />
    )}
  </Icon>
);
const HeadphonesIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" {...glyph} />
    <rect x="3.5" y="14" width="4" height="6" rx="1.5" fill="currentColor" stroke="none" />
    <rect x="16.5" y="14" width="4" height="6" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * The Walkman: the persistent audio element (never unmounted, so opening or closing the panel cannot restart a
 * song) plus the approved artwork as a bottom-right control that opens the music-player panel. Inside a Church
 * interior the control and panel are hidden and the audio stays paused where it was.
 */
export function WalkmanDock({ lifted = false }: { lifted?: boolean }) {
  const env = useWorld();
  const { walkman } = env;
  const art = env.assetRef('walkman_player');
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const opener = useRef<HTMLButtonElement>(null);
  const hidden = !walkman.unlocked || walkman.silenced;

  // Silence closes the panel; it does not come back on its own.
  useEffect(() => {
    if (walkman.silenced) setOpen(false);
  }, [walkman.silenced]);

  // Pick up newly released songs each time the player opens the panel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadWalkmanPlaylist(env.locale).then((tracks) => {
      if (!cancelled && tracks) walkman.setPlaylist(tracks);
    });
    return () => {
      cancelled = true;
    };
    // The controller's setter is stable; only opening (or a language change) refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, env.locale]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      opener.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const audio = (
    <audio
      ref={walkman.audioElementRef}
      src={walkman.track?.audioRef}
      onEnded={walkman.audioProps.onEnded}
      onTimeUpdate={(e) => {
        const current = e.currentTarget.currentTime || 0;
        setTime((t) => ({ ...t, current }));
      }}
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        setTime({
          current: e.currentTarget.currentTime || 0,
          duration: Number.isFinite(d) ? d : 0,
        });
      }}
      onDurationChange={(e) => {
        const d = e.currentTarget.duration;
        setTime((t) => ({ ...t, duration: Number.isFinite(d) ? d : 0 }));
      }}
      data-testid="walkman-audio"
      preload="none"
    />
  );
  // The audio element keeps its slot in the tree either way, so hiding the controls never remounts (restarts) it.
  if (hidden)
    return (
      <>
        {audio}
        {null}
        {null}
      </>
    );

  const hasTracks = walkman.playlist.length > 0;
  const repeatLabel = env.t(
    walkman.repeat === 'off'
      ? 'walkman_repeat_off'
      : walkman.repeat === 'playlist'
        ? 'walkman_repeat_all'
        : 'walkman_repeat_one',
  );
  const canControl = !!walkman.track || hasTracks;
  const ended = Math.min(time.current, time.duration || time.current);

  return (
    <>
      {audio}
      {open && (
        <section
          className={styles.panel}
          role="dialog"
          aria-label={env.t('walkman')}
          data-testid="walkman-panel"
        >
          <header className={styles.header}>
            <h2>{env.t('walkman')}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={() => {
                setOpen(false);
                opener.current?.focus();
              }}
              aria-label={env.t('close')}
              title={env.t('close')}
              data-testid="walkman-panel-close"
            >
              ✕
            </button>
          </header>

          <p className={styles.now} data-testid="walkman-title" aria-live="polite">
            {walkman.track?.title ?? env.t('walkman_nothing')}
          </p>

          <div className={styles.seekRow}>
            <span className={styles.time} data-testid="walkman-elapsed">
              {formatTime(ended)}
            </span>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={time.duration > 0 ? time.duration : 1}
              step={1}
              value={time.duration > 0 ? ended : 0}
              disabled={!walkman.track || time.duration <= 0}
              aria-label={env.t('walkman_seek')}
              aria-valuetext={`${formatTime(ended)} / ${formatTime(time.duration)}`}
              onChange={(e) => {
                // Read the value once, synchronously: `setTime`'s functional updater can run after
                // React has already returned the native event, by which point its `currentTarget`
                // is null (this was crashing the seek control with a real, reproducible TypeError).
                const value = Number(e.currentTarget.value);
                walkman.seek(value);
                setTime((t) => ({ ...t, current: value }));
              }}
              data-testid="walkman-seek"
              // A time bar reads left to right in every language, like the music itself.
              dir="ltr"
            />
            <span className={styles.time} data-testid="walkman-duration">
              {formatTime(time.duration)}
            </span>
          </div>

          <div className={styles.transport} dir="ltr">
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={walkman.shuffle}
              aria-label={env.t('walkman_shuffle')}
              title={env.t('walkman_shuffle')}
              onClick={() => walkman.setShuffle(!walkman.shuffle)}
              data-testid="walkman-shuffle"
            >
              <ShuffleIcon />
            </button>
            <button
              type="button"
              className={styles.control}
              aria-label={env.t('walkman_prev')}
              title={env.t('walkman_prev')}
              onClick={walkman.previous}
              disabled={!canControl}
              data-testid="walkman-prev"
            >
              <PrevIcon />
            </button>
            <button
              type="button"
              className={`${styles.control} ${styles.primary}`}
              aria-label={walkman.playing ? env.t('cafe_pause') : env.t('cafe_play')}
              title={walkman.playing ? env.t('cafe_pause') : env.t('cafe_play')}
              onClick={() => {
                if (walkman.track) walkman.toggle();
                else if (walkman.playlist[0]) walkman.select(walkman.playlist[0], true);
              }}
              disabled={!canControl}
              data-testid="walkman-toggle"
            >
              {walkman.playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className={styles.control}
              aria-label={env.t('walkman_next')}
              title={env.t('walkman_next')}
              onClick={walkman.next}
              disabled={!hasTracks}
              data-testid="walkman-next"
            >
              <NextIcon />
            </button>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={walkman.repeat !== 'off'}
              aria-label={repeatLabel}
              title={repeatLabel}
              onClick={walkman.cycleRepeat}
              data-repeat={walkman.repeat}
              data-testid="walkman-repeat"
            >
              <RepeatIcon one={walkman.repeat === 'one'} />
            </button>
          </div>

          <div className={styles.volumeRow} dir="ltr">
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={walkman.muted}
              aria-label={walkman.muted ? env.t('walkman_unmute') : env.t('walkman_mute')}
              title={walkman.muted ? env.t('walkman_unmute') : env.t('walkman_mute')}
              onClick={() => walkman.setMuted(!walkman.muted)}
              data-testid="walkman-mute"
            >
              <VolumeIcon muted={walkman.muted} />
            </button>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={100}
              step={1}
              value={walkman.muted ? 0 : Math.round(walkman.volume * 100)}
              aria-label={env.t('walkman_volume')}
              onChange={(e) => {
                const value = Number(e.currentTarget.value) / 100;
                walkman.setVolume(value);
                walkman.setMuted(value === 0);
              }}
              data-testid="walkman-volume"
            />
          </div>

          <h3 className={styles.listTitle}>{env.t('walkman_playlist')}</h3>
          {hasTracks ? (
            <ul className={styles.list} data-testid="walkman-playlist">
              {walkman.playlist.map((song) => {
                const active = walkman.track?.songId === song.songId;
                return (
                  <li key={song.songId}>
                    <button
                      type="button"
                      className={styles.track}
                      aria-current={active ? 'true' : undefined}
                      data-active={active ? 'true' : undefined}
                      onClick={() => walkman.select(song, true)}
                      data-testid={`walkman-track-${song.songId}`}
                    >
                      <span className={styles.trackMark} aria-hidden="true">
                        {active ? (walkman.playing ? '♪' : '▸') : ''}
                      </span>
                      <span className={styles.trackTitle}>{song.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty} data-testid="walkman-empty">
              {env.t('walkman_empty')}
            </p>
          )}
        </section>
      )}
      <button
        ref={opener}
        type="button"
        className={styles.dock}
        onClick={() => setOpen((v) => !v)}
        aria-label={env.t('walkman_open')}
        title={env.t('walkman_open')}
        aria-expanded={open}
        data-testid="walkman"
        data-playing={walkman.playing}
        data-silenced={walkman.silenced}
        data-duck={walkman.duckPercent ?? undefined}
        data-lifted={lifted ? 'true' : undefined}
      >
        {art ? (
          <img className={styles.art} src={art} alt="" data-testid="walkman-art" />
        ) : (
          <span className={styles.fallback}>
            <HeadphonesIcon />
          </span>
        )}
        {walkman.playing && <span className={styles.badge} aria-hidden="true" />}
      </button>
    </>
  );
}
