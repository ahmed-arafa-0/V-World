import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { SceneIcon } from '../../components/SceneIcon';
import { mobileMediaRef } from '../../services/mediaVariant';
import { useWorld } from './WorldContext';
import { worldApi } from './worldClient';
import {
  fitPlane,
  placeCompositions,
  reachablePoint,
  rectStyle,
  type Anchor,
  type Rect,
  type PlaceComposition,
  type Plane,
  type SpritePlacement,
} from './placeComposition';
import styles from './world.module.css';

export type StageTheme =
  'church' | 'cafe' | 'arcade' | 'cottage' | 'farm' | 'museum' | 'road' | 'map' | 'hall';

export interface StageProps {
  theme: StageTheme;
  /** A registered Sheet/Drive scene asset id; when it resolves, real artwork replaces the temporary visual. */
  assetId?: string;
  testId: string;
  children?: ReactNode;
  /** Sky/window tint from time of day for interiors. */
  tone?: 'dawn' | 'day' | 'dusk' | 'night';
}

const PORTRAIT = '(max-aspect-ratio: 1/1)';

interface StageGeometry {
  /** The painted plane in viewport pixels, or null while temporary visuals are showing (viewport-relative). */
  plane: Plane | null;
  viewport: { width: number; height: number };
  mobile: boolean;
  composition?: PlaceComposition;
}

const StageGeometryContext = createContext<StageGeometry | null>(null);

/** Geometry of the enclosing Stage; null outside one (hotspots then keep their plain percentage position). */
export function useStageGeometry(): StageGeometry | null {
  return useContext(StageGeometryContext);
}

/**
 * Full-viewport place. With registered artwork it shows the painting (the
 * portrait variant on portrait screens); without, a clearly labelled temporary
 * visual (never passed off as final art). Interactive anchors are placed on the
 * painted plane and pulled back inside the visible frame, so every crop keeps
 * them reachable.
 */
export function Stage({ theme, assetId, testId, children, tone }: StageProps) {
  const env = useWorld();
  const ref = env.assetRef(assetId);
  const asset = assetId ? env.assets?.find((a) => a.assetId === assetId) : undefined;
  const mobileRef = ref && asset ? mobileMediaRef(asset) : null;
  const root = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  // A painting is only shown once it has fully loaded: a slow or cut-short transfer must never leave
  // controls and characters floating over a half-drawn or blank scene.
  const [paint, setPaint] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [paintTry, setPaintTry] = useState(0);
  useEffect(() => {
    setPaint('loading');
    setPaintTry(0);
    setNatural(null);
  }, [ref]);
  const withTry = (url: string) =>
    paintTry === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${paintTry}`;
  const [mobile, setMobile] = useState(() => window.matchMedia?.(PORTRAIT).matches ?? false);
  useEffect(() => {
    const measure = () => {
      if (root.current)
        setViewport({ width: root.current.clientWidth, height: root.current.clientHeight });
      setMobile(window.matchMedia?.(PORTRAIT).matches ?? false);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const composition = placeCompositions[testId];
  const plane =
    ref && natural && viewport.width > 0
      ? fitPlane(
          viewport,
          natural,
          composition ? composition.focus[mobile ? 'mobile' : 'desktop'] : undefined,
        )
      : null;
  const geometry: StageGeometry = { plane, viewport, mobile, composition };
  return (
    <section
      ref={root}
      className={styles.stage}
      data-testid={testId}
      data-theme={theme}
      data-temporary={ref ? 'false' : 'true'}
      data-tone={tone}
      data-viewport={mobile ? 'mobile' : 'desktop'}
    >
      {ref ? (
        <>
          {/* The themed backdrop is always underneath: the scene is never an unpainted region. */}
          <div className={styles.temporary} aria-hidden="true" data-testid="stage-backdrop" />
          <picture>
            {mobileRef && <source media={PORTRAIT} srcSet={withTry(mobileRef)} />}
            <img
              key={paintTry}
              className={plane ? styles.paintingPlane : styles.painting}
              style={{ ...(plane ?? {}), opacity: paint === 'ready' ? 1 : 0 }}
              src={withTry(ref)}
              alt=""
              data-testid="stage-painting"
              data-paint={paint}
              onLoad={(event) => {
                const img = event.currentTarget;
                setNatural({
                  width: img.naturalWidth || 1672,
                  height: img.naturalHeight || 941,
                });
                // decode() settles only once every pixel is ready to paint.
                (img.decode ? img.decode() : Promise.resolve()).then(
                  () => setPaint('ready'),
                  () => setPaint('ready'),
                );
              }}
              onError={() => setPaint('failed')}
            />
          </picture>
          {paint === 'failed' && (
            <div className={styles.paintRetry} role="alert" data-testid="stage-image-failed">
              <span>{env.t('saving_retry')}</span>
              <button
                type="button"
                data-testid="stage-image-retry"
                onClick={() => {
                  setPaint('loading');
                  setPaintTry((n) => n + 1);
                }}
              >
                {env.t('try_again')}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className={styles.temporary} aria-hidden="true" />
          <span className={styles.tempBadge} data-testid="temporary-visual">
            {env.t('temporary_visual')}
          </span>
        </>
      )}
      <StageGeometryContext.Provider value={geometry}>{children}</StageGeometryContext.Provider>
    </section>
  );
}

/** Where an anchor sits: plane-relative and clamped when artwork is showing, plain percentages otherwise. */
export function useAnchorStyle(
  testId: string | undefined,
  x: number,
  y: number,
  atEdge = false,
): CSSProperties {
  const geometry = useStageGeometry();
  if (!geometry) return { left: `${x}%`, top: `${y}%` };
  const entry = testId ? geometry.composition?.anchors[testId] : undefined;
  const anchor: Anchor = entry ? entry[geometry.mobile ? 'mobile' : 'desktop'] : [x, y];
  if (!geometry.plane) return { left: `${anchor[0]}%`, top: `${anchor[1]}%` };
  const point = reachablePoint(geometry.plane, geometry.viewport, anchor, atEdge);
  return { left: point.left, top: point.top };
}

/**
 * A rectangle (or an explicit per-viewport rect) on the painted plane, in viewport pixels; undefined while the
 * temporary visual shows, so the caller's CSS fallback layout applies instead.
 */
export function usePlaneRect(
  source: string | { desktop: Rect; mobile: Rect },
): CSSProperties | undefined {
  const geometry = useStageGeometry();
  if (!geometry?.plane) return undefined;
  const entry = typeof source === 'string' ? geometry.composition?.boxes?.[source] : source;
  if (!entry) return undefined;
  return {
    position: 'absolute',
    ...rectStyle(geometry.plane, geometry.viewport, entry[geometry.mobile ? 'mobile' : 'desktop']),
  };
}

/** A separate character sprite placed on the painted plane (never baked into the scene art). */
function useSpriteStyle(kind: 'companion' | 'marcelino'): CSSProperties | undefined {
  const geometry = useStageGeometry();
  const placement: SpritePlacement | undefined =
    geometry?.composition?.[kind]?.[geometry.mobile ? 'mobile' : 'desktop'];
  if (!geometry?.plane || !placement) return undefined;
  const p = geometry.plane;
  const width = (p.width * placement.width) / 100;
  const half = width / 2;
  const left = Math.min(
    Math.max(p.left + (p.width * placement.x) / 100, half + 8),
    geometry.viewport.width - half - 8,
  );
  const top = Math.min(p.top + (p.height * placement.y) / 100, geometry.viewport.height - 12);
  return { left, top, width, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -100%)' };
}

export function PlaceTitle({ text }: { text: string }) {
  return (
    <h1 className={styles.placeTitle} data-testid="place-title">
      {text}
    </h1>
  );
}

export interface HotspotProps {
  x: number;
  y: number;
  label: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  /** Visually lit (e.g. a lit candle). */
  lit?: boolean;
  slot?: 'interact' | 'walk_forward' | 'walk_back' | 'look_left' | 'look_right' | 'add' | 'remove';
  /** Visibly unavailable, yet still focusable and clickable so the reason can be explained. */
  gated?: boolean;
  badge?: string;
  /** Icon-only on tight layouts; the accessible name (aria-label/title) stays. */
  hideCaption?: boolean;
  /** A painted door in a side wall: keep the target on the door instead of the caption-safe inset. */
  atEdge?: boolean;
}

export function Hotspot({
  x,
  y,
  label,
  onClick,
  testId,
  disabled,
  lit,
  slot = 'interact',
  badge,
  gated,
}: HotspotProps) {
  const env = useWorld();
  return (
    <button
      type="button"
      className={`${styles.hotspot} ${lit ? styles.lit : ''}`}
      style={{ left: `${x}%`, top: `${y}%` } as CSSProperties}
      aria-label={label}
      title={label}
      data-testid={testId}
      data-lit={lit ? 'true' : undefined}
      data-gated={gated ? 'true' : undefined}
      aria-disabled={gated ? true : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <SceneIcon slot={slot} icons={env.icons} className={styles.hotspotIcon} fixedDirection />
      {badge ? <span className={styles.badge}>{badge}</span> : null}
    </button>
  );
}

export function CaptionedHotspot(props: HotspotProps) {
  const position = useAnchorStyle(props.testId, props.x, props.y, props.atEdge);
  return (
    <div className={styles.captioned} style={position}>
      <Hotspot {...props} x={50} y={50} />
      {!props.hideCaption && <span className={styles.caption}>{props.label}</span>}
    </div>
  );
}

export interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
  wide?: boolean;
  dir?: 'ltr' | 'rtl';
}

/** A modal sheet over the place: closes with its button or Escape; never traps the player. */
export function Panel({ title, onClose, children, testId, wide, dir }: PanelProps) {
  const env = useWorld();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.panelBackdrop} data-testid={`${testId}-backdrop`}>
      <div
        className={`${styles.panel} ${wide ? styles.panelWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        dir={dir}
      >
        <header className={styles.panelHeader}>
          <h2>{title}</h2>
          <button
            type="button"
            className={styles.textButton}
            onClick={onClose}
            data-testid={`${testId}-close`}
          >
            {env.t('close')}
          </button>
        </header>
        <div className={styles.panelBody}>{children}</div>
      </div>
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  testId,
  disabled,
  quiet,
}: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      className={quiet ? styles.quietButton : styles.actionButton}
      onClick={onClick}
      data-testid={testId}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** VAR keeps the player company in every place once her artwork is registered. */
export function Companion() {
  const env = useWorld();
  const ref = env.assetRef('var_idle_collar');
  const placed = useSpriteStyle('companion');
  if (!ref) return null;
  return (
    <img
      className={styles.companion}
      style={placed}
      src={ref}
      alt=""
      data-testid="world-companion"
    />
  );
}

/**
 * A tappable scripted-helper bubble next to the companion: asks the server for one authored line
 * for this location and the player's real, current journey state (never AI, never an API key —
 * see `companion-hints.service.ts`). Placed alongside `<Companion />` at every location except the
 * Church, mirroring the sprite's own Church exclusion — never rendered there.
 */
export function CompanionHint({ locationId }: { locationId: string }) {
  const env = useWorld();
  const placed = useSpriteStyle('companion');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [dir, setDir] = useState<'ltr' | 'rtl'>('ltr');
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const r = await worldApi.post<{
      ok: true;
      hint: { text: string; direction: 'ltr' | 'rtl' } | null;
    }>('/companion/hint', { locationId }, env.locale);
    setLoading(false);
    if (r.status === 'online') {
      setText(r.data.hint?.text ?? null);
      setDir(r.data.hint?.direction ?? 'ltr');
    } else {
      setText(null);
    }
  }

  if (!placed) return null;
  const bubbleStyle: CSSProperties = {
    left: placed.left,
    top: placed.top,
    transform: 'translate(-50%, calc(-100% - 40px))',
  };
  return (
    <>
      <button
        type="button"
        className={styles.companionHintButton}
        style={{ left: placed.left, top: placed.top }}
        onClick={() => void toggle()}
        data-testid="companion-hint-button"
        aria-label={env.t('companion_hint_label')}
      >
        💬
      </button>
      {open && (
        <div
          className={styles.companionHintBubble}
          style={bubbleStyle}
          dir={dir}
          data-testid="companion-hint-bubble"
        >
          {loading ? '…' : (text ?? env.t('companion_hint_none'))}
        </div>
      )}
    </>
  );
}

/**
 * Marcelino, the small chick with the mailbag: one separate asset per pose,
 * never merged with VAR, the room or the countdown. `pose` maps to the asset id
 * `marcelino_<pose>`; until that art is registered the 🐥 stand-in shows.
 */
export type MarcelinoPose = 'idle' | 'mailbag' | 'run_away' | 'sleeping';
export function MarcelinoSprite({ pose, testId }: { pose: MarcelinoPose; testId?: string }) {
  const env = useWorld();
  const ref = env.assetRef(`marcelino_${pose}`);
  const placed = useSpriteStyle('marcelino');
  if (!ref) {
    return (
      <span
        className={styles.marcelinoStandIn}
        style={placed ? { left: placed.left, top: placed.top } : undefined}
        data-testid={testId ?? 'marcelino-sprite'}
        data-pose={pose}
        data-standin="true"
        aria-hidden="true"
      >
        🐥
      </span>
    );
  }
  return (
    <img
      className={styles.marcelino}
      style={placed}
      src={ref}
      alt=""
      data-testid={testId ?? 'marcelino-sprite'}
      data-pose={pose}
    />
  );
}

export function TextBlock({
  text,
  dir,
  testId,
}: {
  text: string;
  dir?: 'ltr' | 'rtl';
  testId?: string;
}) {
  return (
    <p className={styles.textBlock} dir={dir} data-testid={testId}>
      {text}
    </p>
  );
}
