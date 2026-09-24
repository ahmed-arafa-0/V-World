// Coordinates are percentages of the actual artwork, not the viewport.
// Portrait paintings have their own composition; never mirror world geography for RTL.

/** Where the cat's paws touch the ground, plus how large the walking sprite is. */
export interface CatPlacement {
  /** Paw contact point, % of the painted plane. */
  x: number;
  y: number;
  /** Width of the WALKING sprite, % of plane width; the seated pose is scaled to match head size. */
  width: number;
}

export interface SceneComposition {
  cat: { desktop: CatPlacement; mobile: CatPlacement };
  /** Walk-forward / walk-back anchors sit on the path, well clear of the cat's ground. */
  forward: [number, number];
  mobileForward: [number, number];
  back: [number, number];
  mobileBack: [number, number];
}

export const sceneComposition: Record<string, SceneComposition> = {
  beach_focus: {
    cat: {
      desktop: { x: 66, y: 89, width: 13 },
      mobile: { x: 70, y: 84, width: 27 },
    },
    forward: [59, 55],
    mobileForward: [57, 48],
    back: [50, 88],
    mobileBack: [50, 88],
  },
  beach_steps: {
    cat: {
      desktop: { x: 67, y: 89, width: 13 },
      mobile: { x: 72, y: 85, width: 27 },
    },
    forward: [51, 63],
    mobileForward: [50, 61],
    back: [50, 87],
    mobileBack: [49, 86],
  },
  steps_church_approach: {
    cat: {
      desktop: { x: 73, y: 86, width: 11 },
      mobile: { x: 73, y: 84, width: 26 },
    },
    forward: [56, 64],
    mobileForward: [50, 62],
    back: [50, 87],
    mobileBack: [52, 88],
  },
  church_focus: {
    cat: {
      desktop: { x: 73, y: 88, width: 11 },
      mobile: { x: 72, y: 86, width: 26 },
    },
    forward: [49, 47],
    mobileForward: [49, 46],
    back: [50, 87],
    mobileBack: [50, 88],
  },
};

/**
 * Measured from the approved sprites (pixel-checked against a gridded crop).
 * `pawX`/`pawY` are the fractions of the sprite where the grounded paws touch,
 * so the sprite is anchored by its paws rather than its box (the seated tail tip
 * hangs below the paws, so the alpha bounding box is not the ground line).
 * `widthScale` matches seated head size to walking head size. `ratio` is
 * height/width. `shadow` is the ground patch's centre as a fraction of the
 * sprite (seated: tail to paws) and its width as a fraction of sprite width.
 * `tone` levels each pose's white balance to the same warm-neutral fur (about
 * RGB 219/207/205) so the poses do not shift in colour; it is gentle so white
 * fur never reads yellow.
 */
export const catPoses = {
  walk: {
    pawX: 0.466,
    pawY: 0.957,
    ratio: 1024 / 1536,
    widthScale: 1,
    shadow: { cx: 0.48, cy: 0.975, width: 0.58 },
    tone: 'brightness(0.95) sepia(0.14) saturate(1.08)',
  },
  idle: {
    pawX: 0.668,
    pawY: 0.913,
    ratio: 1374 / 1145,
    widthScale: 0.613,
    shadow: { cx: 0.47, cy: 0.945, width: 0.66 },
    tone: 'brightness(1.07) sepia(0.07) saturate(0.95)',
  },
} as const;

/** The sun sits low on the left in every scene, so ground shadows fall right and slightly toward camera. */
export const SUN_SHADOW = { dx: 0.1, dy: 0.03, aspect: 0.26 } as const;

export function coverPlane(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  pan: number,
) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale,
    h = imageHeight * scale;
  // Look only within available crop, never expose a blank edge or fake depth.
  return {
    width: w,
    height: h,
    left: -(w - width) * Math.max(0, Math.min(1, 0.5 + pan / 100)),
    top: -(h - height),
  };
}
