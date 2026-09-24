import { useEffect, useRef, useState } from 'react';
import { useWorld } from './WorldContext';
import styles from './world.module.css';

const BASE_VOLUME = 0.6;
/** Walkman music continues over the regional ambience, which lowers but stays audible (Living Bible §12, §18A). */
const UNDER_MUSIC_VOLUME = 0.25;

/**
 * The current region's ambient soundscape (`11_LOCATIONS.ambient_asset_id` → a
 * registered Drive audio asset). It attempts to start by itself; only if the
 * browser blocks that does a single minimal "tap to enable sound" control appear
 * (Living Bible §18J). `assetId = null` is deliberate silence (the Church
 * interior). While a game runs the ambience pauses (games have SFX only).
 * Nothing plays when the asset is not registered yet.
 */
export function Ambience({ assetId, paused }: { assetId: string | null; paused: boolean }) {
  const env = useWorld();
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const src = assetId
    ? env.assets.find((a) => a.assetId === assetId && a.assetType === 'audio')?.mediaRef
    : undefined;
  const underMusic = env.walkman.playing && !env.walkman.silenced;

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = underMusic ? UNDER_MUSIC_VOLUME : BASE_VOLUME;
    if (!src || paused) {
      audio.pause();
      return;
    }
    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, [src, paused, underMusic]);

  return (
    <>
      <audio
        ref={ref}
        src={src}
        loop
        preload="none"
        data-testid="ambience-audio"
        data-asset={assetId ?? undefined}
      />
      {src && blocked && !paused && (
        <button
          type="button"
          className={`${styles.quietButton} ${styles.audioChip}`}
          data-testid="enable-audio"
          onClick={() =>
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => undefined)
          }
        >
          {env.t('enable_audio')}
        </button>
      )}
    </>
  );
}
