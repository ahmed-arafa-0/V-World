import { useEffect, useState } from 'react';
import type { MapStateResponse } from '@veoullas-world/contracts';
import { useWorld, type PlaceId } from '../WorldContext';
import { worldApi } from '../worldClient';
import { CaptionedHotspot, PlaceTitle, TextBlock } from '../ui';
import styles from '../world.module.css';

/**
 * The island painting's pixel size. Everything on the map is positioned in THIS image's coordinate system
 * (including its transparent padding), inside a plane that is letter-boxed exactly like the image, so a marker
 * stays on its building at every viewport size and orientation.
 */
export const MAP_IMAGE = { width: 1792, height: 2128 } as const;

/**
 * Each destination's building on the painting, as image pixels (measured on the 1792×2128 artwork):
 * the Everkeep palace at the top, the Cottage (small house, upper right), the VARcade (large building below it),
 * the Café (lower right, outdoor tables), the Church (large, lower left), the Farm's planted fields (left) and
 * the Beach dock at the shoreline. Composition data, not content.
 */
export const MAP_ANCHOR_PX: Record<string, [number, number]> = {
  museum: [910, 285],
  cottage: [1262, 512],
  arcade: [1284, 852],
  cafe: [1210, 1140],
  church: [780, 1230],
  farm: [340, 970],
  beach: [896, 1930],
};

/** Feet positions beside each building, clear of the fixed-size pin/caption even in portrait. */
const AVATAR_FEET_PX: Record<string, [number, number]> = {
  museum: [1050, 390],
  cottage: [970, 660],
  arcade: [1510, 805],
  cafe: [1500, 1110],
  church: [1030, 1230],
  farm: [160, 880],
  beach: [1150, 1840],
};

/** The same anchors as percent of the image (what the plane positions with). */
export const MAP_ANCHORS: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(MAP_ANCHOR_PX).map(([id, [x, y]]) => [
    id,
    [(x / MAP_IMAGE.width) * 100, (y / MAP_IMAGE.height) * 100],
  ]),
);

/**
 * Veoulla on the map: three static poses (`map_avatar_idle`, `map_avatar_walking`, `map_avatar_arrival`). Code moves
 * her along the road (a CSS transition, switched off under reduced motion); the images are not animation cycles.
 * Without the art the plain marker remains.
 */
function MapAvatar({
  walking,
  arrived,
  at,
  x,
  y,
  label,
}: {
  walking: boolean;
  arrived: boolean;
  at: string;
  x: number;
  y: number;
  label: string;
}) {
  const env = useWorld();
  const pose = walking ? 'walking' : arrived ? 'arrival' : 'idle';
  const art = env.assetRef(`map_avatar_${pose}`);
  if (!art) {
    return (
      <span
        className={styles.avatar}
        style={{ left: `${x}%`, top: `${y - 3}%` }}
        data-testid="map-avatar"
        data-state={walking ? 'walking' : 'idle'}
        data-at={at}
        aria-label={label}
      />
    );
  }
  return (
    <img
      className={styles.avatarArt}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -${pose === 'walking' ? 98.6 : pose === 'idle' ? 99.5 : 100}%)`,
      }}
      src={art}
      alt={label}
      data-testid="map-avatar"
      data-state={walking ? 'walking' : 'idle'}
      data-pose={pose}
      data-at={at}
    />
  );
}

/**
 * The living Map (M14): a high-angle island over the registered ocean loop.
 * Locked places sit under mist and vines; Veoulla's avatar walks the road to
 * the chosen place, then the view descends into it.
 */
export function MapView({
  onEnterPlace,
  freedomLine,
  currentLocation,
}: {
  onEnterPlace: (place: PlaceId) => void;
  freedomLine?: string;
  currentLocation?: string;
}) {
  const env = useWorld();
  const [state, setState] = useState<MapStateResponse | null>(null);
  const [avatar, setAvatar] = useState<string>(currentLocation ?? 'cottage');
  const [walking, setWalking] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [line, setLine] = useState(freedomLine ?? '');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    // A transient failure (for example the Sheet's request quota) must not leave an island without pins:
    // say so, then retry with a growing pause.
    const load = (attempt: number) => {
      void worldApi.get<MapStateResponse>('/map').then((r) => {
        if (cancelled) return;
        if (r.status === 'online') {
          setLine((current) => (current === env.t('saving_retry') ? '' : current));
          setState(r.data);
          setAvatar(currentLocation ?? r.data.currentLocation);
          // She has just arrived on the map: hold the arrival pose briefly, then settle to idle.
          setArrived(true);
          window.setTimeout(() => setArrived(false), 1600);
          return;
        }
        setLine(env.t('saving_retry'));
        if (attempt < 5) timer = window.setTimeout(() => load(attempt + 1), 2500 * (attempt + 1));
      });
    };
    load(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocean = env.assets.find((a) => a.assetId === 'map_ocean_loop');
  const island = env.assetRef('map_island_transparent');
  const [feetX, feetY] = AVATAR_FEET_PX[avatar] ?? AVATAR_FEET_PX.cottage!;
  const ax = (feetX / MAP_IMAGE.width) * 100;
  const ay = (feetY / MAP_IMAGE.height) * 100;

  async function travel(id: string) {
    if (walking) return;
    setWalking(true);
    const r = await worldApi.post<MapStateResponse>('/map/travel', { locationId: id });
    if (r.status !== 'online') {
      setWalking(false);
      setLine(env.t('saving_retry'));
      return;
    }
    setState(r.data);
    setAvatar(id);
    // Let the avatar finish its walk (skipped under reduced motion), then descend.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(
      () => {
        setWalking(false);
        onEnterPlace(id as PlaceId);
      },
      reduce ? 0 : 950,
    );
  }

  return (
    <section
      className={`${styles.stage} ${styles.mapFade}`}
      data-testid="world-map"
      data-theme="map"
      data-temporary={island && ocean ? 'false' : 'true'}
    >
      {ocean ? (
        <video
          className={styles.painting}
          src={ocean.mediaRef}
          poster={ocean.hasPosterVariant ? `${ocean.mediaRef}&variant=poster` : undefined}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <div className={styles.temporary} aria-hidden="true" />
      )}
      <PlaceTitle text={env.t('place_map')} />
      <div className={styles.mapArea}>
        <div
          className={styles.mapPlane}
          data-testid="map-plane"
          style={{ aspectRatio: `${MAP_IMAGE.width} / ${MAP_IMAGE.height}` }}
        >
          {island ? (
            <img className={styles.mapIsland} src={island} alt="" data-testid="map-island" />
          ) : (
            <span className={styles.tempBadge} data-testid="temporary-visual">
              {env.t('temporary_visual')}
            </span>
          )}
          {state?.locations.map((l) => {
            const [x, y] = MAP_ANCHORS[l.locationId] ?? [50, 50];
            const locked = l.locked;
            return (
              <div key={l.locationId}>
                {locked && (
                  <span
                    className={styles.mist}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    data-testid={`mist-${l.locationId}`}
                    aria-hidden="true"
                  />
                )}
                <CaptionedHotspot
                  testId={`map-pin-${l.locationId}`}
                  x={x}
                  y={y}
                  label={env.t(`place_${l.locationId}` as never)}
                  disabled={locked || walking}
                  lit={avatar === l.locationId}
                  onClick={() => void travel(l.locationId)}
                />
                {locked && (
                  <span
                    style={{
                      position: 'absolute',
                      left: `${x}%`,
                      top: `${y}%`,
                      zIndex: 5,
                      transform: 'translate(-50%,-50%)',
                      pointerEvents: 'none',
                    }}
                    aria-hidden="true"
                  >
                    🌿
                  </span>
                )}
              </div>
            );
          })}
          <MapAvatar
            walking={walking}
            at={avatar}
            x={ax}
            y={ay}
            arrived={arrived}
            label={env.t('map_here')}
          />
        </div>
      </div>
      {line && (
        <div className={styles.narration} data-testid="freedom-line">
          <TextBlock text={line} />
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => setLine('')}
            data-testid="freedom-continue"
          >
            {env.t('continue')}
          </button>
        </div>
      )}
    </section>
  );
}
