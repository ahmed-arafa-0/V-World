import { describe, expect, it } from 'vitest';
import {
  CANDLE_MIN_TARGET_PX,
  candleRowCounts,
  layoutCandleTray,
} from '../src/features/world/candleTray';

describe('candleRowCounts', () => {
  it('returns nothing for zero candles', () => {
    expect(candleRowCounts(0, 600)).toEqual([]);
  });

  it('fits everything in one row when the box is wide enough', () => {
    expect(candleRowCounts(4, 600)).toEqual([4]);
  });

  it('never exceeds 5 per row even in a very wide box', () => {
    expect(candleRowCounts(10, 4000)).toEqual([5, 5]);
  });

  it('adds more rows instead of shrinking a target below the 44px minimum', () => {
    // 150px / 2 = 75px (>= 44+gap); 150/3 = 50px (< 44+10 gap) — so it must fall back to 2 per row.
    expect(candleRowCounts(6, 150)).toEqual([2, 2, 2]);
  });

  it('falls back to a single column on a very narrow box, never fewer than 1 per row', () => {
    expect(candleRowCounts(3, 40)).toEqual([1, 1, 1]);
  });

  it('balances rows evenly rather than leaving a nearly-empty last row', () => {
    // 7 candles, capped at 5/row -> 2 rows -> evened to 4 and 3, not 5 and 2.
    expect(candleRowCounts(7, 4000)).toEqual([4, 3]);
  });
});

describe('layoutCandleTray', () => {
  it('returns one slot per candle, all inside the box, with the back row smaller than the front row', () => {
    const box = { width: 600, height: 100 };
    const slots = layoutCandleTray(10, box);
    expect(slots).toHaveLength(10);
    for (const s of slots) {
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.left).toBeLessThanOrEqual(box.width);
      expect(s.top).toBeGreaterThanOrEqual(0);
      expect(s.top).toBeLessThanOrEqual(box.height);
      expect(s.scale).toBeGreaterThan(0);
      expect(s.scale).toBeLessThanOrEqual(1);
    }
    const backRowScale = slots[0]!.scale;
    const frontRowScale = slots[slots.length - 1]!.scale;
    expect(frontRowScale).toBeGreaterThan(backRowScale);
  });

  it('keeps every candle in the same row at least the 44px minimum apart', () => {
    const box = { width: 600, height: 100 };
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const slots = layoutCandleTray(count, box);
      const byRow = new Map<number, number[]>();
      for (const s of slots) {
        const list = byRow.get(s.top) ?? [];
        list.push(s.left);
        byRow.set(s.top, list);
      }
      for (const xs of byRow.values()) {
        const sorted = [...xs].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(CANDLE_MIN_TARGET_PX);
        }
      }
    }
  });

  it('centers a single candle in the middle of the tray, at half depth', () => {
    const box = { width: 600, height: 100 };
    const [slot] = layoutCandleTray(1, box);
    expect(slot!.left).toBeCloseTo(box.width / 2, 0);
    expect(slot!.top).toBeCloseTo(box.height / 2, 0);
  });

  it('returns nothing for zero candles or a zero-size box', () => {
    expect(layoutCandleTray(0, { width: 600, height: 100 })).toEqual([]);
    expect(layoutCandleTray(3, { width: 0, height: 0 })).toHaveLength(3);
  });
});
