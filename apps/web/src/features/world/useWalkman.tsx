import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { worldApi } from './worldClient';

export interface WalkmanTrack {
  songId: string;
  title: string;
  audioRef: string;
}

export type WalkmanRepeat = 'off' | 'playlist' | 'one';

/** Handlers the persistent <audio> element wires up; the element itself lives in WalkmanDock. */
export interface WalkmanAudioProps {
  onEnded: () => void;
}

export interface WalkmanApi {
  unlocked: boolean;
  track: WalkmanTrack | null;
  /** Songs the Sheet allows on the Walkman (Café releases flagged `available_in_walkman`). */
  playlist: WalkmanTrack[];
  playing: boolean;
  /** True while a place holds the Walkman silent (the Church). */
  silenced: boolean;
  /** Reduced volume in percent while a game runs, or null. */
  duckPercent: number | null;
  /** Player volume 0..1 and mute; independent of game ducking. */
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: WalkmanRepeat;
  select: (track: WalkmanTrack, play?: boolean) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setShuffle: (on: boolean) => void;
  cycleRepeat: () => void;
  setPlaylist: (tracks: WalkmanTrack[]) => void;
  hydrate: (unlocked: boolean, selection: { track: WalkmanTrack | null; playing: boolean }) => void;
  /** Marks the Walkman received without touching the selected song or playback. */
  unlock: () => void;
  /**
   * Absolute silence (Church). Entering pauses at once and keeps the track position; leaving does NOT
   * resume — the Walkman stays paused and available for the player to press play.
   */
  silence: (on: boolean) => void;
  /** Lower the volume during games, restoring it afterwards. */
  duck: (percent: number | null) => void;
  audioProps: WalkmanAudioProps;
  audioElementRef: React.RefObject<HTMLAudioElement>;
}

const REPEAT_ORDER: WalkmanRepeat[] = ['off', 'playlist', 'one'];

/**
 * The persistent Walkman: one audio element for the whole world, so a
 * selected song keeps playing across location routes. Nothing here starts
 * audio by itself — playback only follows an explicit tap, and a browser that
 * blocks it simply leaves the Walkman paused.
 */
export function useWalkmanController(): WalkmanApi {
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [track, setTrack] = useState<WalkmanTrack | null>(null);
  const [playlist, setPlaylistState] = useState<WalkmanTrack[]>([]);
  const [playing, setPlaying] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [duckPercent, setDuckPercent] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<WalkmanRepeat>('off');
  const history = useRef<string[]>([]);
  const latest = useRef({ track, playlist, shuffle, repeat, playing });
  latest.current = { track, playlist, shuffle, repeat, playing };

  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;
    const ducked = duckPercent === null ? 1 : Math.max(0, Math.min(1, duckPercent / 100));
    audio.volume = Math.max(0, Math.min(1, volume)) * ducked;
    audio.muted = muted;
  }, [duckPercent, track, volume, muted]);

  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio || !track) return;
    if (playing && !silenced) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, silenced, track]);

  const persist = useCallback((next: WalkmanTrack | null, isPlaying: boolean) => {
    void worldApi.post(
      '/walkman',
      next ? { songId: next.songId, playing: isPlaying } : { songId: null },
    );
  }, []);

  const select = useCallback(
    (next: WalkmanTrack, play = true) => {
      const current = latest.current.track;
      if (current && current.songId !== next.songId) history.current.push(current.songId);
      setTrack(next);
      setPlaying(play);
      persist(next, play);
    },
    [persist],
  );

  const toggle = useCallback(() => {
    if (!track) return;
    setPlaying((p) => {
      persist(track, !p);
      return !p;
    });
  }, [persist, track]);

  /** The track after the current one: random (never the same) under shuffle, otherwise in order. */
  const pickNext = useCallback((wrap: boolean): WalkmanTrack | null => {
    const { track: current, playlist: list, shuffle: shuffled } = latest.current;
    if (list.length === 0) return null;
    const at = current ? list.findIndex((t) => t.songId === current.songId) : -1;
    if (shuffled && list.length > 1) {
      const others = list.filter((t) => t.songId !== current?.songId);
      return others[Math.floor(Math.random() * others.length)] ?? null;
    }
    if (at + 1 < list.length) return list[at + 1] ?? null;
    return wrap ? (list[0] ?? null) : null;
  }, []);

  const next = useCallback(() => {
    const target = pickNext(true);
    if (target) select(target, true);
  }, [pickNext, select]);

  const previous = useCallback(() => {
    const audio = audioElementRef.current;
    // More than a few seconds in: restart the song, like any player.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const { playlist: list, track: current } = latest.current;
    if (list.length === 0) return;
    let target: WalkmanTrack | undefined;
    const backId = history.current.pop();
    if (backId) target = list.find((t) => t.songId === backId);
    if (!target) {
      const at = current ? list.findIndex((t) => t.songId === current.songId) : 0;
      target = list[(Math.max(0, at) - 1 + list.length) % list.length];
    }
    if (!target) return;
    setTrack(target);
    setPlaying(true);
    persist(target, true);
  }, [persist]);

  const seek = useCallback((seconds: number) => {
    const audio = audioElementRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, seconds);
  }, []);

  const setPlaylist = useCallback((tracks: WalkmanTrack[]) => setPlaylistState(tracks), []);

  const hydrate = useCallback<WalkmanApi['hydrate']>((isUnlocked, selection) => {
    setUnlocked(isUnlocked);
    setTrack(selection.track);
    // A reload never resumes sound on its own; the player taps play.
    setPlaying(false);
  }, []);

  const unlock = useCallback(() => setUnlocked(true), []);

  const silence = useCallback((on: boolean) => {
    setSilenced(on);
    // Pause and keep the position. Leaving never resumes: the player presses play.
    if (on) setPlaying(false);
  }, []);

  const audioProps = useMemo<WalkmanAudioProps>(
    () => ({
      onEnded: () => {
        const { repeat: mode, playing: wasPlaying } = latest.current;
        if (!wasPlaying) return;
        const audio = audioElementRef.current;
        if (mode === 'one' && audio) {
          audio.currentTime = 0;
          audio.play().catch(() => setPlaying(false));
          return;
        }
        const target = pickNext(mode === 'playlist');
        if (target) select(target, true);
        else setPlaying(false);
      },
    }),
    [pickNext, select],
  );

  return useMemo(
    () => ({
      unlocked,
      track,
      playlist,
      playing,
      silenced,
      duckPercent,
      volume,
      muted,
      shuffle,
      repeat,
      select,
      toggle,
      next,
      previous,
      seek,
      setVolume: setVolumeState,
      setMuted: setMutedState,
      setShuffle: setShuffleState,
      cycleRepeat: () =>
        setRepeat((r) => REPEAT_ORDER[(REPEAT_ORDER.indexOf(r) + 1) % REPEAT_ORDER.length]!),
      setPlaylist,
      hydrate,
      unlock,
      silence,
      duck: setDuckPercent,
      audioProps,
      audioElementRef,
    }),
    [
      unlocked,
      track,
      playlist,
      playing,
      silenced,
      duckPercent,
      volume,
      muted,
      shuffle,
      repeat,
      select,
      toggle,
      next,
      previous,
      seek,
      setPlaylist,
      hydrate,
      unlock,
      silence,
      audioProps,
    ],
  );
}
