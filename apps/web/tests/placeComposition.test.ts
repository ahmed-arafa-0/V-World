import { describe, expect, it } from 'vitest';
import { cropStageAssetId } from '../src/features/world/views/FarmView';
import {
  FARM_BEDS,
  SAFE,
  decorAnchor,
  fitPlane,
  placeCompositions,
  reachablePoint,
  rectStyle,
} from '../src/features/world/placeComposition';

describe('place composition', () => {
  it('cover-fits landscape art and keeps the focal fraction of the crop', () => {
    const plane = fitPlane({ width: 1000, height: 1000 }, { width: 1672, height: 941 }, [0.5, 0.5]);
    expect(plane.height).toBeCloseTo(1000);
    expect(plane.width).toBeCloseTo(1777, 0);
    expect(plane.left).toBeCloseTo(-(plane.width - 1000) / 2);
    const rightFocus = fitPlane(
      { width: 1000, height: 1000 },
      { width: 1672, height: 941 },
      [1, 1],
    );
    expect(rightFocus.left).toBeCloseTo(-(rightFocus.width - 1000));
  });

  it('pulls a cropped-away anchor back inside the reachable frame', () => {
    const viewport = { width: 390, height: 844 };
    const plane = fitPlane(viewport, { width: 1672, height: 941 }); // landscape art on a phone
    const point = reachablePoint(plane, viewport, [2, 99]);
    expect(point.left).toBeGreaterThanOrEqual(viewport.width * 0.23);
    expect(point.top).toBeLessThanOrEqual(viewport.height - SAFE.bottom);
    const high = reachablePoint(plane, viewport, [50, 0]);
    expect(high.top).toBeGreaterThanOrEqual(SAFE.topNarrow);
  });

  it('lets a painted side-wall door sit near the edge without the caption-safe inset', () => {
    const viewport = { width: 390, height: 844 };
    const plane = fitPlane(viewport, { width: 941, height: 1672 });
    const inset = reachablePoint(plane, viewport, [86.5, 37]);
    const door = reachablePoint(plane, viewport, [86.5, 37], true);
    expect(inset.left).toBeCloseTo(viewport.width * 0.77);
    expect(door.left).toBeGreaterThan(inset.left);
    expect(door.left).toBeLessThanOrEqual(viewport.width * 0.92);
  });

  it('keeps navigation out of the Walkman corner (bottom right)', () => {
    const viewport = { width: 393, height: 852 };
    const plane = fitPlane(viewport, { width: 941, height: 1672 });
    const point = reachablePoint(plane, viewport, [92, 90]);
    expect(point.left).toBeLessThanOrEqual(viewport.width - SAFE.walkman.w);
  });

  it('never returns an inverted range on a tiny viewport', () => {
    const viewport = { width: 120, height: 100 };
    const point = reachablePoint(
      fitPlane(viewport, { width: 941, height: 1672 }),
      viewport,
      [50, 50],
    );
    expect(Number.isFinite(point.left) && Number.isFinite(point.top)).toBe(true);
  });

  it('places every Cottage home and the countdown for both desktop and mobile', () => {
    for (const view of ['cottage-interior', 'cottage-exterior'] as const) {
      const composition = placeCompositions[view]!;
      expect(composition.companion).toBeDefined();
      expect(composition.marcelino).toBeDefined();
    }
    const interior = placeCompositions['cottage-interior']!.anchors;
    for (const id of ['cottage-countdown', 'cottage-var-place', 'cottage-marcelino-place']) {
      expect(interior[id]?.desktop).toBeDefined();
      expect(interior[id]?.mobile).toBeDefined();
    }
    // The homes follow the paintings (cat kennel lower right, chick home on the rug): they must stay distinct.
    for (const view of ['desktop', 'mobile'] as const) {
      const [cx, cy] = interior['cottage-var-place']![view];
      const [mx, my] = interior['cottage-marcelino-place']![view];
      expect(Math.hypot(cx - mx, cy - my)).toBeGreaterThan(12);
    }
  });

  it('seats every decoration slot on the painted hutch shelves (two boards), distinct and inside the hutch', () => {
    for (const count of [1, 4, 5, 6, 8]) {
      const points = Array.from({ length: count }, (_, i) => decorAnchor(i, count, false));
      expect(new Set(points.map((p) => p.join(','))).size).toBe(count);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(40);
        expect(x).toBeLessThanOrEqual(53);
        expect(y).toBeGreaterThanOrEqual(31);
        expect(y).toBeLessThanOrEqual(46);
      }
    }
    // Rows fill the upper board first, left to right.
    const upper = [0, 1, 2].map((i) => decorAnchor(i, 6, false));
    expect(upper.map((p) => p[1])).toEqual([35, 35, 35]);
    expect(upper.map((p) => p[0])).toEqual([...upper.map((p) => p[0])].sort((a, b) => a - b));
    // Portrait: the same two boards, measured on the portrait painting (hutch ≈ x 40–53%, y 30–36%).
    for (const count of [1, 4, 6]) {
      for (let i = 0; i < count; i++) {
        const [x, y] = decorAnchor(i, count, true);
        expect(x).toBeGreaterThanOrEqual(40);
        expect(x).toBeLessThanOrEqual(53);
        expect(y).toBeGreaterThanOrEqual(30);
        expect(y).toBeLessThanOrEqual(36);
      }
    }
  });
});

describe('painted-art composition tables', () => {
  it('has six farm beds per crop, inside the plane and ordered from the front row back', () => {
    for (const view of ['desktop', 'mobile'] as const) {
      const beds = FARM_BEDS[view];
      expect(beds).toHaveLength(6);
      for (const [x, y, width] of beds) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(100);
        expect(y).toBeGreaterThan(30);
        expect(y).toBeLessThan(90);
        expect(width).toBeGreaterThan(0);
      }
      // Front bed of each side stands lower on the plane (bigger) than the back one.
      expect(beds[0]![1]).toBeGreaterThan(beds[2]![1]);
      expect(beds[3]![1]).toBeGreaterThan(beds[5]![1]);
    }
  });

  it('has five distinct cabinet boxes that do not overlap in either orientation', () => {
    const boxes = placeCompositions['arcade-interior']!.boxes!;
    for (const view of ['desktop', 'mobile'] as const) {
      const rects = [1, 2, 3, 4, 5].map((n) => boxes[`cabinet-${n}`]![view]);
      for (let i = 1; i < rects.length; i++) {
        expect(rects[i]![0]).toBeGreaterThanOrEqual(rects[i - 1]![0] + rects[i - 1]![2]);
      }
    }
  });

  it('keeps a rectangle inside the viewport even when the plane is cropped', () => {
    const viewport = { width: 390, height: 844 };
    const plane = fitPlane(viewport, { width: 941, height: 1672 }, [1, 0.5]);
    const box = rectStyle(plane, viewport, [95, 96, 20, 10]);
    expect(box.left + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.top + box.height).toBeLessThanOrEqual(viewport.height);
  });
});

describe('crop growth-state art convention', () => {
  it('maps the four plant states of each crop to crop_<crop>_<state>', () => {
    for (const crop of ['sunflower', 'mango', 'blueberry']) {
      for (const state of ['planted', 'growing', 'ready', 'wilted']) {
        expect(cropStageAssetId(crop, state)).toBe(`crop_${crop}_${state}`);
      }
    }
  });
});
