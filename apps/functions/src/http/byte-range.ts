/**
 * Parses and validates an HTTP `Range` request header against a known total
 * size. Supports exactly the three standard single-range forms required by
 * M03-B1: `bytes=start-end`, `bytes=start-`, and `bytes=-suffixLength`. A
 * multi-range request (comma-separated) or any other malformed syntax is
 * reported distinctly from an out-of-bounds (but syntactically valid)
 * range, since the two need different HTTP responses (400 vs 416).
 */

export type RangeParseResult =
  | { type: 'none' }
  | { type: 'satisfiable'; start: number; end: number }
  | { type: 'unsatisfiable' }
  | { type: 'malformed' };

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

export function parseRangeHeader(header: string | undefined, totalSize: number): RangeParseResult {
  if (!header) return { type: 'none' };

  if (header.includes(',')) {
    return { type: 'malformed' };
  }

  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return { type: 'malformed' };

  const [, startRaw, endRaw] = match;

  if (startRaw === '' && endRaw === '') {
    return { type: 'malformed' };
  }

  if (totalSize <= 0) {
    return { type: 'unsatisfiable' };
  }

  // Suffix form: "bytes=-N" — the last N bytes of the resource.
  if (startRaw === '') {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { type: 'malformed' };
    }
    const start = Math.max(0, totalSize - suffixLength);
    return { type: 'satisfiable', start, end: totalSize - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0) {
    return { type: 'malformed' };
  }
  if (start >= totalSize) {
    return { type: 'unsatisfiable' };
  }

  // Open-ended form: "bytes=start-" — from start to the end of the resource.
  if (endRaw === '') {
    return { type: 'satisfiable', start, end: totalSize - 1 };
  }

  const end = Number(endRaw);
  if (!Number.isFinite(end) || end < start) {
    return { type: 'malformed' };
  }

  return { type: 'satisfiable', start, end: Math.min(end, totalSize - 1) };
}
