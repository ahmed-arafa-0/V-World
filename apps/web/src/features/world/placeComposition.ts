// Responsive composition for Phase 2 places.
//
// Anchors are percentages of the PAINTED plane (the artwork), never of the
// viewport, and each place has a desktop (landscape) and a mobile (portrait)
// composition because the two are separate paintings. Anchors are provisional
// until the final art lands: they are calibrated per place here, in one table,
// so recalibrating never touches a view. Nothing here is content; ids are the
// existing hotspot test ids. World geography is physical and never mirrored for RTL.

export type Anchor = readonly [x: number, y: number];
export interface ViewportAnchors {
  desktop: Anchor;
  mobile: Anchor;
}
export interface SpritePlacement {
  /** Ground/anchor point, % of the painted plane. */
  x: number;
  y: number;
  /** Sprite width, % of the painted plane width. */
  width: number;
}

/** A painted-plane rectangle: [left, top, width, height], all % of the plane. */
export type Rect = readonly [x: number, y: number, w: number, h: number];
export interface ViewportRects {
  desktop: Rect;
  mobile: Rect;
}

export interface PlaceComposition {
  /** Which part of the painting stays visible when it is cropped: 0 = left/top edge, 1 = right/bottom edge. */
  focus: { desktop: Anchor; mobile: Anchor };
  anchors: Record<string, ViewportAnchors>;
  /** VAR, the cat: her home is a separate sprite, placed on the painted plane. */
  companion?: { desktop: SpritePlacement; mobile: SpritePlacement };
  /** Marcelino, the chick: always a separate asset from VAR, the room and the countdown. */
  marcelino?: { desktop: SpritePlacement; mobile: SpritePlacement };
  /** Painted-plane rectangles for things drawn over the art (cabinets, candles, the artifact, countdown fields). */
  boxes?: Record<string, ViewportRects>;
}

const both = (desktop: Anchor, mobile: Anchor = desktop): ViewportAnchors => ({ desktop, mobile });
const rect = (desktop: Rect, mobile: Rect = desktop): ViewportRects => ({ desktop, mobile });
const sprite = (
  desktop: readonly [number, number, number],
  mobile: readonly [number, number, number] = desktop,
): { desktop: SpritePlacement; mobile: SpritePlacement } => ({
  desktop: { x: desktop[0], y: desktop[1], width: desktop[2] },
  mobile: { x: mobile[0], y: mobile[1], width: mobile[2] },
});

/**
 * Farm beds, calibrated on the painted soil: [x, y, spriteWidth], ground point = centre of each bed's soil
 * (% of the plane). Six beds, three on each side of the stone path. The sprite width follows the bed's depth.
 */
export const FARM_BEDS: Record<
  'desktop' | 'mobile',
  ReadonlyArray<readonly [number, number, number]>
> = {
  desktop: [
    [26, 68, 11],
    [34, 58.5, 8.5],
    [20, 53.5, 7],
    [80, 68, 11],
    [74, 58.5, 8.5],
    [69, 52.5, 7],
  ],
  mobile: [
    [24, 62, 24],
    [22, 53, 20],
    [21, 45, 17],
    [78, 62, 24],
    [78, 53, 20],
    [79, 45, 17],
  ],
};

export const placeCompositions: Record<string, PlaceComposition> = {
  junction: {
    focus: { desktop: [0.5, 0.5], mobile: [0.4, 0.5] },
    anchors: {
      'junction-church': both([31, 52], [33, 47]),
      'junction-cafe': both([85, 50], [80, 49]),
      'junction-ahead': both([52, 36], [52, 37]),
      'junction-back': both([50, 92], [50, 92]),
    },
    companion: sprite([50, 92, 11], [50, 92, 26]),
  },
  'cafe-exterior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.55, 0.5] },
    anchors: { 'cafe-enter': both([54, 56], [55, 54]) },
    companion: sprite([84, 94, 11], [80, 94, 26]),
  },
  'arcade-exterior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.5] },
    anchors: { 'arcade-enter': both([53, 57], [49, 56]) },
    companion: sprite([84, 94, 11], [80, 94, 26]),
  },
  'museum-exterior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.5] },
    anchors: {
      'museum-gate': both([50, 66], [53, 62]),
      'museum-door': both([52, 50], [53, 52]),
    },
    companion: sprite([84, 94, 11], [80, 94, 26]),
  },
  'church-interior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.62, 0.5] },
    anchors: {
      'church-verse': both([50, 30], [50, 33]),
      // The painted candle corner: the brass sand tray on the stone plinth at the left of the nave
      // (measured on the church candle patch art — desktop and portrait are different croppings).
      'church-candle-corner': both([7, 63], [8, 93]),
      'church-story': both([86, 63], [88, 62]),
      'church-photo': both([90, 33], [91, 34]),
      'church-quiz': both([60, 60], [58, 51]),
      'church-silence': both([36, 60], [32, 51]),
      'church-leave': both([76, 93], [86, 95]),
    },
  },
  'church-candle-corner': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.45] },
    anchors: { 'church-candle-back': both([50, 90]) },
    // The sand tray's usable surface, measured on the church candle patch art: [left, top, width, height]
    // in plane percent. `top` is the tray's back (far) edge, `top+height` its front (near) edge — the
    // candle corner component interpolates candle placement and scale between them for a perspective feel.
    // Add/Remove are their own fixed control bar (a variable-width row of controls, not a single point).
    // Front row's bottom edge pulled back off the brass front rim onto the visible sand (verified in a
    // real render against the registered art: the original height put front-row bases right at the rim).
    boxes: { candles: rect([21, 59, 58, 6], [18, 57.7, 65, 2.4]) },
  },
  'cafe-interior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.3, 0.5] },
    anchors: {
      'cafe-gramophone': both([25, 46], [24, 44]),
      'cafe-request': both([66, 50], [85, 50]),
    },
    companion: sprite([46, 94, 11], [50, 95, 26]),
  },
  'arcade-interior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.5] },
    anchors: { 'arcade-scoreboard': both([87, 34], [50, 23]) },
    boxes: {
      // One box per painted cabinet: [left, top, width, height] of the screen-and-panel body.
      'cabinet-1': rect([22.7, 27.5, 12.6, 38.5], [16, 35, 10, 18]),
      'cabinet-2': rect([35.4, 27.5, 11.2, 38.5], [31, 35, 10, 18]),
      'cabinet-3': rect([47.6, 27.5, 11.2, 38.5], [46, 35, 10, 18]),
      'cabinet-4': rect([59.5, 27.5, 11.2, 38.5], [61, 35, 10, 18]),
      'cabinet-5': rect([70.8, 27.5, 12.2, 38.5], [75, 35, 10, 18]),
    },
    companion: sprite([20, 92, 12], [30, 94, 28]),
  },
  'cottage-exterior': {
    focus: { desktop: [0.5, 0.65], mobile: [0.4, 0.7] },
    anchors: {
      'cottage-outside-mailbox': both([33, 54], [17, 50]),
      'cottage-enter': both([63, 47], [57, 43]),
      'cottage-back': both([8, 90], [12, 92]),
      'cottage-forward': both([92, 90], [88, 92]),
    },
    companion: sprite([84, 96, 11], [80, 96, 26]),
    marcelino: sprite([44, 80, 5.5], [34, 74, 14]),
  },
  'cottage-interior': {
    // Keep the mantel below the HUD when a wide, short viewport crops the room.
    focus: { desktop: [0.5, 0], mobile: [0.55, 0.6] },
    anchors: {
      // The countdown opens from the mantel display, high and right of centre so it survives every crop.
      'cottage-countdown': both([73, 32], [78, 27]),
      'cottage-corner': both([13, 50], [14, 50]),
      'cottage-mailbox': both([6, 66], [9, 60]),
      'window-state': both([14, 32], [12, 30]),
      // Cat home is the painted kennel (lower right); the chick home is a spot on the woven rug.
      'cottage-var-place': both([87, 81], [84, 58]),
      'cottage-marcelino-place': both([38, 87], [53, 60]),
      'cottage-leave': both([50, 95], [50, 95]),
    },
    boxes: {
      // The four blank display fields on the mantel (days, hours, minutes, seconds).
      'countdown-days': rect([65.95, 17.75, 3.05, 5.7], [67.2, 21.3, 3.9, 2.85]),
      'countdown-hours': rect([70, 17.35, 3.05, 5.7], [72.5, 21.1, 4.1, 2.85]),
      'countdown-minutes': rect([74.15, 16.95, 3.2, 5.7], [77.9, 20.95, 4.1, 2.85]),
      'countdown-seconds': rect([78.5, 16.5, 3.2, 5.7], [83.3, 20.7, 4.1, 2.85]),
    },
    companion: sprite([76, 95, 11], [68, 67, 22]),
    marcelino: sprite([38, 90, 5.5], [53, 64.5, 12]),
  },
  'farm-exterior': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.5] },
    anchors: { 'farm-barn': both([50, 33], [55, 33]) },
    companion: sprite([54, 94, 11], [52, 92, 26]),
    marcelino: sprite([44, 82, 5.5], [42, 72, 13]),
  },
  'museum-hall': {
    focus: { desktop: [0.5, 0.5], mobile: [0.5, 0.5] },
    anchors: {
      'hall-progress': both([64, 38], [54, 36]),
      // Two painted walnut wing doors (v2 hall art): both open the one existing wings selector.
      'hall-wings': both([23.6, 44], [19, 37]),
      'hall-wings-east': both([84.8, 44], [86.5, 37]),
    },
    boxes: {
      artifact: rect([44, 42, 12, 28], [40, 46, 22, 28]),
    },
    companion: sprite([66, 94, 11], [70, 95, 26]),
  },
};

/** Decoration slots are configured (>= 4, `cottage_decor_slots`): spread any number evenly along one shelf. */
export function decorAnchor(index: number, count: number, mobile: boolean): Anchor {
  // Desktop: along the open shelf of the painted cabinet. Mobile: across the rug, where the cabinet is too small to tap.
  if (!mobile) {
    // The painted hutch has two open shelf boards (upper y≈38, lower y≈45): fill them in two rows, left to right.
    const perRow = Math.max(1, Math.ceil(count / 2));
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = index - row * perRow;
    const x = inRow <= 1 ? 46.5 : 42 + (9 * col) / (inRow - 1);
    return [x, row === 0 ? 35 : 42.5];
  }
  // Portrait painting: the hutch's two open compartments sit at x≈40–53%, boards at y≈30% and y≈35% of the plane.
  const perRow = Math.max(1, Math.ceil(count / 2));
  const row = Math.floor(index / perRow);
  const inRow = Math.min(perRow, count - row * perRow);
  const col = index - row * perRow;
  return [inRow <= 1 ? 46.5 : 40.5 + (12 * col) / (inRow - 1), row === 0 ? 30.3 : 35.2];
}

export interface Plane {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Cover-fit `natural` into the viewport, keeping the focal fraction of the overflow visible. */
export function fitPlane(
  viewport: { width: number; height: number },
  natural: { width: number; height: number },
  focus: Anchor = [0.5, 0.5],
): Plane {
  const scale = Math.max(viewport.width / natural.width, viewport.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    width,
    height,
    left: -(width - viewport.width) * focus[0],
    top: -(height - viewport.height) * focus[1],
  };
}

/** Clearances that keep an interactive anchor reachable and clear of the title, HUD and captions. */
export const SAFE = {
  x: 60,
  top: 72,
  topNarrow: 184,
  bottom: 76,
  narrow: 900,
  /** The Walkman button's corner (bottom-right), in pixels. */
  walkman: { w: 128, h: 132 },
} as const;

/** A plane percentage → viewport pixels, pulled back inside the reachable area of the viewport. */
export function reachablePoint(
  plane: Plane,
  viewport: { width: number; height: number },
  anchor: Anchor,
  /** A painted door in the side wall: needs only the touch-target half-width and a short caption clear of the edge. */
  atEdge = false,
): { left: number; top: number } {
  const x = plane.left + (plane.width * anchor[0]) / 100;
  const y = plane.top + (plane.height * anchor[1]) / 100;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  // Captions wrap at 44vw on narrow screens, so keep half of that clear of each side edge.
  // (A landscape phone is narrow but its captions still fit on one line, so it needs far less side clearance.)
  const portraitNarrow = viewport.width <= SAFE.narrow && viewport.height >= viewport.width;
  const sideX = atEdge
    ? Math.min(SAFE.x, viewport.width * 0.08)
    : portraitNarrow
      ? viewport.width * 0.23
      : viewport.width <= SAFE.narrow
        ? viewport.width * 0.09
        : SAFE.x;
  const left = clamp(x, sideX, viewport.width - sideX);
  // On narrow screens the place title sits below the key and Walkman rows.
  const top = clamp(
    y,
    viewport.width <= SAFE.narrow ? SAFE.topNarrow : SAFE.top,
    viewport.height - SAFE.bottom,
  );
  // The bottom-right corner belongs to the Walkman button: keep navigation and its caption clear of it.
  const inWalkmanCorner =
    left > viewport.width - SAFE.walkman.w && top > viewport.height - SAFE.walkman.h;
  return { left: inWalkmanCorner ? viewport.width - SAFE.walkman.w : left, top };
}

/** A plane rectangle → viewport pixels, kept inside the viewport (so nothing invisible sits off screen). */
export function rectStyle(
  plane: Plane,
  viewport: { width: number; height: number },
  r: Rect,
): { left: number; top: number; width: number; height: number } {
  const left = plane.left + (plane.width * r[0]) / 100;
  const top = plane.top + (plane.height * r[1]) / 100;
  const width = (plane.width * r[2]) / 100;
  const height = (plane.height * r[3]) / 100;
  const cl = Math.min(Math.max(left, 4), Math.max(4, viewport.width - width - 4));
  const ct = Math.min(Math.max(top, 4), Math.max(4, viewport.height - height - 4));
  return { left: cl, top: ct, width, height };
}

/** Artwork-attached text must crop with the image, never clamp independently like a control. */
export function paintedRect(plane: Plane, r: Rect) {
  return {
    left: plane.left + (plane.width * r[0]) / 100,
    top: plane.top + (plane.height * r[1]) / 100,
    width: (plane.width * r[2]) / 100,
    height: (plane.height * r[3]) / 100,
  };
}
