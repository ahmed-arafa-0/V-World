import { useEffect, useState } from 'react';

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GateArtLayout {
  /** Natural pixel size of the registered Gate artwork variant. */
  natural: { width: number; height: number };
  /** Bottom edge of the painted lock cluster, as a fraction of the artwork height. */
  lockBottom: number;
  /** Where a seated cat's paws rest on the cobbles, as fractions of the artwork. */
  seated: { x: number; y: number; width: number };
  /** Where the leap starts on the cobbles and where it passes through the doors, as fractions of the artwork. */
  jump: { fromX: number; groundY: number; slitX: number; slitY: number; width: number };
}

/**
 * Geometry of the two supplied Gate paintings (`gate_closed_*` / `gate_ajar_*`,
 * which share one composition). Coordinates are fractions of the artwork, so
 * anything placed with them stays glued to the painting under `object-fit: cover`.
 */
export const GATE_ART: { desktop: GateArtLayout; mobile: GateArtLayout } = {
  desktop: {
    natural: { width: 1705, height: 923 },
    lockBottom: 0.725,
    seated: { x: 0.76, y: 0.965, width: 0.125 },
    jump: { fromX: 0.3, groundY: 0.955, slitX: 0.5, slitY: 0.7, width: 0.16 },
  },
  mobile: {
    natural: { width: 941, height: 1672 },
    lockBottom: 0.6,
    seated: { x: 0.74, y: 0.785, width: 0.25 },
    jump: { fromX: 0.2, groundY: 0.85, slitX: 0.5, slitY: 0.55, width: 0.4 },
  },
};

/** Where `object-fit: cover` (centred) draws an image of the given size inside a viewport. */
export function centerCoverFrame(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
): Frame {
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { width, height, left: (viewWidth - width) / 2, top: (viewHeight - height) / 2 };
}

const PORTRAIT = '(max-aspect-ratio: 1/1)';

/** The Gate painting's on-screen frame plus its layout; recomputed on resize. */
export function useGateFrame(): { frame: Frame; layout: GateArtLayout; portrait: boolean } {
  const read = () => {
    const portrait = window.matchMedia(PORTRAIT).matches;
    const layout = portrait ? GATE_ART.mobile : GATE_ART.desktop;
    return {
      portrait,
      layout,
      frame: centerCoverFrame(
        window.innerWidth,
        window.innerHeight,
        layout.natural.width,
        layout.natural.height,
      ),
    };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return state;
}
