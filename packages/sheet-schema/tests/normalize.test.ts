import { describe, expect, it } from 'vitest';
import {
  isBlank,
  isPlaceholder,
  normalizeBoolean,
  normalizeCsv,
  normalizeDate,
  normalizeInteger,
  normalizeJson,
  normalizeNumber,
} from '../src/normalize.js';

describe('normalizeBoolean', () => {
  it.each([
    ['TRUE', true],
    ['true', true],
    ['1', true],
    ['FALSE', false],
    ['false', false],
    ['0', false],
  ])('normalizes %s to %s', (raw, expected) => {
    const result = normalizeBoolean(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it('rejects an unrecognized boolean-like value', () => {
    const result = normalizeBoolean('yes');
    expect(result.ok).toBe(false);
  });
});

describe('normalizeInteger', () => {
  it('accepts integers', () => {
    const result = normalizeInteger('42');
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('rejects floats and non-numeric text', () => {
    expect(normalizeInteger('4.2').ok).toBe(false);
    expect(normalizeInteger('abc').ok).toBe(false);
  });
});

describe('normalizeNumber', () => {
  it('accepts integers and floats', () => {
    expect(normalizeNumber('4.2')).toEqual({ ok: true, value: 4.2 });
    expect(normalizeNumber('42')).toEqual({ ok: true, value: 42 });
  });

  it('rejects non-numeric text', () => {
    expect(normalizeNumber('abc').ok).toBe(false);
  });
});

describe('normalizeCsv', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(normalizeCsv('a, b ,,c')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for a blank cell', () => {
    expect(normalizeCsv('')).toEqual([]);
  });
});

describe('normalizeJson', () => {
  it('parses valid JSON without executing it', () => {
    const result = normalizeJson('{"a":1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('treats a blank cell as null, not an error', () => {
    expect(normalizeJson('')).toEqual({ ok: true, value: null });
  });

  it('rejects invalid JSON', () => {
    expect(normalizeJson('{not json').ok).toBe(false);
  });
});

describe('normalizeDate', () => {
  it('parses ISO date strings', () => {
    const result = normalizeDate('2026-09-26');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(new Date('2026-09-26').toISOString());
  });

  it('parses Google Sheets date serial numbers (integer and fractional)', () => {
    // Serial 1 = 1899-12-31 (one day after the 1899-12-30 epoch).
    const result = normalizeDate('1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(new Date(Date.UTC(1899, 11, 31)).toISOString());
  });

  it('treats a blank cell as an empty value, not an error', () => {
    expect(normalizeDate('')).toEqual({ ok: true, value: '' });
  });

  it('rejects unrecognized text', () => {
    expect(normalizeDate('not a date').ok).toBe(false);
  });
});

describe('isPlaceholder', () => {
  it('detects angle-bracket placeholders', () => {
    expect(isPlaceholder('<DRIVE_FILE_ID_GATE_DESKTOP>')).toBe(true);
    expect(isPlaceholder('<PLACEHOLDER>')).toBe(true);
  });

  it('does not flag ordinary values', () => {
    expect(isPlaceholder('asset_gate_bg')).toBe(false);
    expect(isPlaceholder('')).toBe(false);
  });
});

describe('isBlank', () => {
  it('treats undefined, null, empty, and whitespace-only as blank', () => {
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank('x')).toBe(false);
  });
});
