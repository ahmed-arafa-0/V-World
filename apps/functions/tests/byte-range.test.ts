import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from '../src/http/byte-range.js';

describe('parseRangeHeader', () => {
  it('returns "none" when no Range header is present', () => {
    expect(parseRangeHeader(undefined, 1000)).toEqual({ type: 'none' });
  });

  it('parses "bytes=start-end"', () => {
    expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({
      type: 'satisfiable',
      start: 0,
      end: 99,
    });
  });

  it('clamps "end" to the last valid byte', () => {
    expect(parseRangeHeader('bytes=900-999999', 1000)).toEqual({
      type: 'satisfiable',
      start: 900,
      end: 999,
    });
  });

  it('parses open-ended "bytes=start-"', () => {
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({
      type: 'satisfiable',
      start: 500,
      end: 999,
    });
  });

  it('parses suffix "bytes=-N" (last N bytes)', () => {
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({
      type: 'satisfiable',
      start: 900,
      end: 999,
    });
  });

  it('clamps a suffix length larger than the total size to the whole file', () => {
    expect(parseRangeHeader('bytes=-5000', 1000)).toEqual({
      type: 'satisfiable',
      start: 0,
      end: 999,
    });
  });

  it('is unsatisfiable when start is at or beyond the total size', () => {
    expect(parseRangeHeader('bytes=1000-1099', 1000)).toEqual({ type: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=5000-', 1000)).toEqual({ type: 'unsatisfiable' });
  });

  it('is unsatisfiable against a zero-length resource', () => {
    expect(parseRangeHeader('bytes=0-10', 0)).toEqual({ type: 'unsatisfiable' });
  });

  it('rejects a multi-range request as malformed', () => {
    expect(parseRangeHeader('bytes=0-99,200-299', 1000)).toEqual({ type: 'malformed' });
  });

  it('rejects a non-bytes unit as malformed', () => {
    expect(parseRangeHeader('items=0-99', 1000)).toEqual({ type: 'malformed' });
  });

  it('rejects "bytes=-" (neither start nor end) as malformed', () => {
    expect(parseRangeHeader('bytes=-', 1000)).toEqual({ type: 'malformed' });
  });

  it('rejects a reversed range (end before start) as malformed', () => {
    expect(parseRangeHeader('bytes=500-100', 1000)).toEqual({ type: 'malformed' });
  });

  it('rejects a zero/negative suffix length as malformed', () => {
    expect(parseRangeHeader('bytes=-0', 1000)).toEqual({ type: 'malformed' });
  });

  it('rejects garbage syntax as malformed', () => {
    expect(parseRangeHeader('not-a-range', 1000)).toEqual({ type: 'malformed' });
    expect(parseRangeHeader('bytes=abc-def', 1000)).toEqual({ type: 'malformed' });
  });
});
