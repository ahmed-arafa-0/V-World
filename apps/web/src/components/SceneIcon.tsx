import { useState, type ReactNode } from 'react';
import type { RuntimeIconEntry } from '@veoullas-world/contracts';
import { useLocaleStore } from '../i18n/localeStore';
import { staticDirectionFor } from '../i18n/locales';

/**
 * Player control icons. Selection is Sheet-driven: each slot names one
 * `09_ICONS.icon_id`, and when that row resolves to a real same-origin
 * `mediaRef` the authored artwork is rendered (mirrored in RTL only when the
 * row says `rtl_mirror`). Slots the Sheet has no usable row for fall back to
 * the neutral inline glyph below, so a control is never blank or a raw text
 * character. The same glyph is used if the authored image fails to load. The fallback is a stand-in for the same Sheet id, not a second
 * icon registry — adding the row to 09_ICONS replaces it without a code change.
 */
export type SceneIconSlot =
  | 'walk_forward'
  | 'walk_back'
  | 'look_left'
  | 'look_right'
  | 'interact'
  | 'settings'
  | 'map'
  | 'logout'
  | 'add'
  | 'remove';

export const SCENE_ICON_IDS: Record<SceneIconSlot, string> = {
  walk_forward: 'icon_walk_forward',
  walk_back: 'icon_walk_back',
  look_left: 'icon_look_left',
  look_right: 'icon_look_right',
  interact: 'icon_interact',
  settings: 'icon_settings',
  map: 'icon_map',
  logout: 'icon_logout',
  add: 'icon_candle_add',
  remove: 'icon_candle_remove',
};

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const GLYPHS: Record<SceneIconSlot, ReactNode> = {
  // Two stacked chevrons: keep going along the path.
  walk_forward: (
    <>
      <path d="M6.5 12.5 12 7l5.5 5.5" {...stroke} />
      <path d="M6.5 18 12 12.5 17.5 18" {...stroke} />
    </>
  ),
  walk_back: (
    <>
      <path d="M6.5 6 12 11.5 17.5 6" {...stroke} />
      <path d="M6.5 11.5 12 17 17.5 11.5" {...stroke} />
    </>
  ),
  // Single chevrons: turn the view, do not move.
  look_left: <path d="M14.5 6.5 9 12l5.5 5.5" {...stroke} />,
  look_right: <path d="M9.5 6.5 15 12l-5.5 5.5" {...stroke} />,
  interact: (
    <>
      <path d="M12 4.5 19.5 12 12 19.5 4.5 12Z" {...stroke} />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  settings: (
    <>
      <path d="M5 8h14M5 16h14" {...stroke} />
      <circle cx="9" cy="8" r="2.1" {...stroke} strokeWidth={1.7} fill="#221a12" />
      <circle cx="15" cy="16" r="2.1" {...stroke} strokeWidth={1.7} fill="#221a12" />
    </>
  ),
  // A folded map with a route pin.
  map: (
    <>
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13L15 19.5l-6-2-5.5 2Z" {...stroke} />
      <path d="M9 4.5v13M15 6.5v13" {...stroke} strokeWidth={1.5} />
    </>
  ),
  // A door with an arrow leaving it.
  logout: (
    <>
      <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" {...stroke} />
      <path d="M14 8.5 18 12l-4 3.5M18 12H9.5" {...stroke} />
    </>
  ),
  // A small standing candle with a "+" beside it: add a new one to the tray.
  add: (
    <>
      <rect x="10.3" y="10.2" width="3.4" height="8.8" rx="1" {...stroke} />
      <path d="M12 10.2c-1-1.2-1-2.3 0-3.3 1 1 1 2.1 0 3.3Z" {...stroke} />
      <path d="M18 14.5v4M16 16.5h4" {...stroke} strokeWidth={1.6} />
    </>
  ),
  // A simple trash can: take the selected candle out of the tray.
  remove: (
    <>
      <path
        d="M6 8h12M9.5 8V6.4A1.4 1.4 0 0 1 10.9 5h2.2a1.4 1.4 0 0 1 1.4 1.4V8M8 8l.9 10.1A1.5 1.5 0 0 0 10.4 19.5h3.2a1.5 1.5 0 0 0 1.5-1.4L16 8"
        {...stroke}
      />
      <path d="M10.5 11v5M13.5 11v5" {...stroke} strokeWidth={1.5} />
    </>
  ),
};

export function SceneIcon({
  slot,
  icons = [],
  className,
  fixedDirection = false,
}: {
  slot: SceneIconSlot;
  icons?: RuntimeIconEntry[];
  className?: string;
  /** Geographic controls (left/right on a road) keep their physical direction in RTL. */
  fixedDirection?: boolean;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const authored = icons.find((icon) => icon.iconId === SCENE_ICON_IDS[slot] && icon.mediaRef);
  // A ref that resolves but fails to load (missing/blocked file) falls back to the glyph.
  const [failedRef, setFailedRef] = useState<string | null>(null);
  if (authored?.mediaRef && authored.mediaRef !== failedRef) {
    const mirrored = !fixedDirection && authored.rtlMirror && staticDirectionFor(locale) === 'rtl';
    return (
      <img
        className={className}
        src={authored.mediaRef}
        alt=""
        aria-hidden="true"
        data-testid={`icon-${slot}`}
        data-icon-source="sheet"
        onError={() => setFailedRef(authored.mediaRef)}
        style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      />
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-testid={`icon-${slot}`}
      data-icon-source="fallback"
    >
      {GLYPHS[slot]}
    </svg>
  );
}
