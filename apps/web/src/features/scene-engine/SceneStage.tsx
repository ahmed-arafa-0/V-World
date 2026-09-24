import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  RuntimeAssetStatus,
  RuntimeIconEntry,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import { SceneIcon } from '../../components/SceneIcon';
import { mobileMediaRef } from '../../services/mediaVariant';
import { useLocaleStore } from '../../i18n/localeStore';
import { playerText, type PlayerTextKey } from '../../i18n/playerText';
import { catPoses, coverPlane, SUN_SHADOW, sceneComposition } from './sceneComposition';
import type { DiamondMarker, SceneNode } from './types';
import styles from './SceneStage.module.css';

export interface SceneStageProps {
  node: SceneNode;
  pan: number;
  fadeOut?: boolean;
  onMarkerActivate?: (markerId: string) => void;
  backgroundAsset?: RuntimeAssetStatus | null;
  /** Stationary (seated) pose. */
  companionAsset?: RuntimeAssetStatus | null;
  /** Movement pose, shown only while `moving`. */
  walkingAsset?: RuntimeAssetStatus | null;
  moving?: boolean;
  /** On-screen look controls; only rendered when the artwork is actually cropped sideways. */
  look?: { onLeft: () => void; onRight: () => void; atMin: boolean; atMax: boolean };
  icons?: RuntimeIconEntry[];
  disabled?: boolean;
  onForward?: () => void;
  onBack?: () => void;
  uiText?: RuntimeUiTextEntry[];
}

export function SceneStage({
  node,
  pan,
  fadeOut = false,
  onMarkerActivate,
  backgroundAsset,
  companionAsset,
  walkingAsset,
  moving = false,
  look,
  icons = [],
  disabled = false,
  onForward,
  onBack,
  uiText = [],
}: SceneStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [natural, setNatural] = useState({ width: 1672, height: 941 });
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-aspect-ratio: 1/1)').matches);
  const locale = useLocaleStore((s) => s.locale);
  useEffect(() => {
    const measure = () => {
      if (ref.current)
        setSize({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      setMobile(window.matchMedia('(max-aspect-ratio: 1/1)').matches);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const composition = sceneComposition[node.id] ?? sceneComposition.beach_focus!;
  const placement = mobile ? composition.cat.mobile : composition.cat.desktop;
  const forward = mobile ? composition.mobileForward : composition.forward;
  const back = mobile ? composition.mobileBack : composition.back;
  const plane = coverPlane(size.width, size.height, natural.width, natural.height, pan);
  // Stationary is seated; the walking sprite is only for movement. If the seated
  // asset is not registered, fall back to whichever pose exists rather than no cat.
  const walking = moving && walkingAsset ? true : !companionAsset && !!walkingAsset;
  const catAsset = walking ? walkingAsset : (companionAsset ?? null);
  const pose = catPoses[walking ? 'walk' : 'idle'];
  const spriteWidth = (plane.width * placement.width * pose.widthScale) / 100;
  const pawLeft = (plane.width * placement.x) / 100;
  // Keep grounded paws (and their shadow) inside the visible frame when the crop is tight.
  const pawTop = Math.min((plane.height * placement.y) / 100, size.height - plane.top - 14);
  const shadowWidth = spriteWidth * pose.shadow.width;
  const shadowLeft = (pose.shadow.cx - pose.pawX) * spriteWidth + shadowWidth * SUN_SHADOW.dx;
  const shadowTop =
    (pose.shadow.cy - pose.pawY) * spriteWidth * pose.ratio + shadowWidth * SUN_SHADOW.dy;
  const canLook = !!look && plane.width - size.width > 8;
  const blocked = disabled || fadeOut;
  const label = (key: PlayerTextKey) => playerText(key, locale, uiText);
  const renderMarker = (marker: DiamondMarker, position: number[], anchored = false) => (
    <button
      key={marker.id}
      type="button"
      className={`${styles.marker} ${anchored ? styles.markerAnchored : ''}`}
      data-testid={`marker-${marker.id}`}
      aria-label={label(marker.id as PlayerTextKey)}
      title={label(marker.id as PlayerTextKey)}
      style={{ left: `${position[0]}%`, top: `${position[1]}%` }}
      disabled={blocked}
      onClick={() => !blocked && onMarkerActivate?.(marker.id)}
    >
      <SceneIcon
        slot={anchored ? 'walk_forward' : 'interact'}
        icons={icons}
        className={styles.icon}
      />
      {marker.captioned && (
        <span
          className={`${styles.caption} ${anchored ? styles.captionEnd : ''}`}
          data-testid={`marker-caption-${marker.id}`}
        >
          {label(marker.id as PlayerTextKey)}
        </span>
      )}
    </button>
  );
  return (
    <div
      ref={ref}
      className={`${styles.stage} ${fadeOut ? styles.fadeOut : ''}`}
      data-testid={`scene-stage-${node.id}`}
      data-node-id={node.id}
      data-placeholder={backgroundAsset ? 'false' : 'true'}
      aria-hidden={fadeOut || undefined}
    >
      <div className={styles.plane} style={plane} data-testid="scene-image-plane">
        {backgroundAsset && (
          <picture>
            {mobileMediaRef(backgroundAsset) && (
              <source media="(max-aspect-ratio: 1/1)" srcSet={mobileMediaRef(backgroundAsset)!} />
            )}
            <img
              className={styles.backgroundPhoto}
              src={backgroundAsset.mediaRef}
              alt=""
              data-testid={`scene-photo-${node.id}`}
              onLoad={(event) =>
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
          </picture>
        )}
        {/* Placeholder drawings never coexist with an illustration. */}
        {!backgroundAsset &&
          node.layers.map((layer) => (
            <div
              key={layer.id}
              className={styles.layer}
              data-testid={`scene-layer-${node.id}-${layer.id}`}
              data-occluder={layer.isOccluder || undefined}
              style={{ background: layer.css }}
            />
          ))}
        {catAsset && (
          <div
            className={`${styles.cat} ${walking ? styles.catWalking : ''}`}
            data-testid="scene-cat"
            data-pose={walking ? 'walk' : 'idle'}
            style={
              {
                left: pawLeft,
                top: pawTop,
                '--walk-in': `${-spriteWidth * 0.35}px`,
              } as CSSProperties
            }
          >
            <span
              className={styles.catShadow}
              data-testid="scene-cat-shadow"
              style={{
                width: shadowWidth,
                height: shadowWidth * SUN_SHADOW.aspect,
                left: shadowLeft,
                top: shadowTop,
              }}
            />
            <img
              key={walking ? 'walk' : 'idle'}
              className={styles.companion}
              src={catAsset.mediaRef}
              alt=""
              data-testid="scene-companion"
              style={{
                width: spriteWidth,
                transform: `translate(${-pose.pawX * 100}%, ${-pose.pawY * 100}%)`,
                filter: pose.tone,
              }}
            />
          </div>
        )}
        {onMarkerActivate &&
          node.markers
            .filter((marker) => !marker.viewportAnchor)
            .map((marker) => {
              // The authored path marker and forward control are the same action.
              if ((marker.destinationNodeId || marker.id === 'church_door_hint') && onForward)
                return null;
              const position =
                marker.id === 'shell'
                  ? mobile
                    ? [36, 93]
                    : [50, 94]
                  : marker.id.startsWith('church_door')
                    ? forward
                    : [marker.worldX, marker.worldY];
              return renderMarker(marker, position);
            })}
        {onForward && (
          <button
            type="button"
            className={`${styles.marker} ${styles.navigation}`}
            data-testid="walk-forward"
            aria-label={label('forward')}
            title={label('forward')}
            disabled={blocked}
            style={{ left: `${forward[0]}%`, top: `${forward[1]}%` }}
            onClick={() => !blocked && onForward()}
          >
            <SceneIcon slot="walk_forward" icons={icons} className={styles.icon} />
          </button>
        )}
        {onBack && (
          <button
            type="button"
            className={`${styles.marker} ${styles.navigation}`}
            data-testid="walk-back"
            aria-label={label('back')}
            title={label('back')}
            disabled={blocked}
            style={{ left: `${back[0]}%`, top: `${back[1]}%` }}
            onClick={() => !blocked && onBack()}
          >
            <SceneIcon slot="walk_back" icons={icons} className={styles.icon} />
          </button>
        )}
      </div>
      {onMarkerActivate &&
        node.markers
          .filter((marker) => marker.viewportAnchor)
          .map((marker) =>
            renderMarker(
              marker,
              mobile ? marker.viewportAnchor!.mobile : marker.viewportAnchor!.desktop,
              true,
            ),
          )}
      {canLook && look && (
        <>
          <button
            type="button"
            className={`${styles.look} ${styles.lookLeft}`}
            data-testid="look-left"
            aria-label={label('lookLeft')}
            title={label('lookLeft')}
            disabled={blocked || look.atMin}
            onClick={look.onLeft}
          >
            <SceneIcon slot="look_left" icons={icons} className={styles.lookIcon} />
          </button>
          <button
            type="button"
            className={`${styles.look} ${styles.lookRight}`}
            data-testid="look-right"
            aria-label={label('lookRight')}
            title={label('lookRight')}
            disabled={blocked || look.atMax}
            onClick={look.onRight}
          >
            <SceneIcon slot="look_right" icons={icons} className={styles.lookIcon} />
          </button>
        </>
      )}
    </div>
  );
}
