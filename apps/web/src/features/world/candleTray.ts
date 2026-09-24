/**
 * Pure geometry for the candle-corner sand tray: a shallow perspective trapezoid — a back row that sits
 * smaller and higher, a front row that sits larger and lower, exactly like a real tray seen from a slight
 * height. No DOM here, so the placement math is unit-testable on its own; `ChurchView` converts these
 * box-relative pixel offsets into on-screen positions using the already-measured plane rectangle.
 *
 * Row packing never drops a tap target below 44 CSS px: a box too narrow for the preferred number per
 * row gets fewer per row and more rows instead (Living Bible/handoff: "staggered rows ... rather than
 * shrinking tap targets into unusable dots").
 */

export interface CandleTraySlot {
  /** Pixel offset from the tray box's left edge. */
  left: number;
  /** Pixel offset from the tray box's top edge — the candle's ground/base point. */
  top: number;
  /** Perspective scale for this row, 0..1 (back row smaller, front row larger). */
  scale: number;
}

const BACK_INSET = 0.08;
const FRONT_INSET = 0.02;
const BACK_SCALE = 0.76;
const FRONT_SCALE = 1;
export const CANDLE_MIN_TARGET_PX = 44;
const CANDLE_GAP_PX = 10;
const MAX_PER_ROW = 5;

/** How many candles sit in each row, back row first, keeping every column at least 44px apart. */
export function candleRowCounts(count: number, boxWidthPx: number): number[] {
  if (count <= 0) return [];
  let perRow = Math.min(count, MAX_PER_ROW);
  while (perRow > 1 && boxWidthPx / perRow < CANDLE_MIN_TARGET_PX + CANDLE_GAP_PX) perRow--;
  const rows = Math.ceil(count / perRow);
  const evened = Math.ceil(count / rows);
  const counts: number[] = [];
  let remaining = count;
  for (let r = 0; r < rows; r++) {
    const n = Math.min(evened, remaining);
    counts.push(n);
    remaining -= n;
  }
  return counts;
}

/** Places `count` candles inside a `width` × `height` px tray box, back row (index 0) first. */
export function layoutCandleTray(
  count: number,
  box: { width: number; height: number },
): CandleTraySlot[] {
  const rowCounts = candleRowCounts(count, box.width);
  const rows = rowCounts.length;
  const slots: CandleTraySlot[] = [];
  for (let r = 0; r < rows; r++) {
    const depth = rows === 1 ? 0.5 : r / (rows - 1);
    const inset = BACK_INSET + (FRONT_INSET - BACK_INSET) * depth;
    // Include the entire brass foot and contact shadow, not just its centre. The box itself is
    // calibrated inside the actual sand in each painting; nothing is clamped to the viewport.
    const footInset = Math.min(
      box.width / 2,
      (Math.max(70, Math.min(box.width * 0.28, 230)) * (93 / 640)) / 2 + 7,
    );
    const usableLeft = Math.min(box.width / 2, box.width * inset + footInset);
    const usableWidth = Math.max(0, box.width - 2 * usableLeft);
    const top = box.height * depth;
    const scale = BACK_SCALE + (FRONT_SCALE - BACK_SCALE) * depth;
    const n = rowCounts[r]!;
    for (let c = 0; c < n; c++) {
      // Alternate rows sit between the neighbouring row's columns, avoiding hidden rear candles.
      const across = n === 1 ? 0.5 : rows === 1 ? c / (n - 1) : (c + (r % 2 ? 0.75 : 0.25)) / n;
      slots.push({ left: usableLeft + usableWidth * across, top, scale });
    }
  }
  return slots;
}
