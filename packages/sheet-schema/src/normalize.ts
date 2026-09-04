/**
 * Google Sheets values API returns everything as strings (FORMATTED_VALUE).
 * These helpers turn those raw strings into safe, typed values without ever
 * executing sheet content (JSON.parse only, no eval/Function).
 */

export function isBlank(raw: string | undefined | null): boolean {
  return raw === undefined || raw === null || raw.trim() === '';
}

/** Matches an un-replaced content placeholder such as <PLACEHOLDER> or <DRIVE_FILE_ID_GATE_DESKTOP>. */
export function isPlaceholder(raw: string | undefined | null): boolean {
  if (isBlank(raw)) return false;
  return /^<[^<>]+>$/.test(raw!.trim());
}

export type NormalizeResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function normalizeBoolean(raw: string): NormalizeResult<boolean> {
  const trimmed = raw.trim();
  if (/^true$/i.test(trimmed) || trimmed === '1') return { ok: true, value: true };
  if (/^false$/i.test(trimmed) || trimmed === '0') return { ok: true, value: false };
  return { ok: false, reason: `"${raw}" is not a recognized boolean (TRUE/FALSE/1/0)` };
}

export function normalizeInteger(raw: string): NormalizeResult<number> {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, reason: `"${raw}" is not a valid integer` };
  }
  return { ok: true, value: Number.parseInt(trimmed, 10) };
}

export function normalizeNumber(raw: string): NormalizeResult<number> {
  const trimmed = raw.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) {
    return { ok: false, reason: `"${raw}" is not a valid number` };
  }
  return { ok: true, value: Number(trimmed) };
}

export function normalizeCsv(raw: string): string[] {
  if (isBlank(raw)) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function normalizeJson(raw: string): NormalizeResult<unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, reason: `"${raw}" is not valid JSON` };
  }
}

const GOOGLE_SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Normalizes a date/datetime cell to an ISO 8601 UTC string.
 * Handles both ISO-formatted cells and raw Google Sheets date serial numbers
 * (integer or fractional, epoch 1899-12-30) — the underlying workbook mixes
 * both depending on whether a column has an applied date number format.
 */
export function normalizeDate(raw: string): NormalizeResult<string> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: '' };

  if (ISO_LIKE.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: `"${raw}" looks like a date but does not parse` };
    }
    return { ok: true, value: parsed.toISOString() };
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    const ms = GOOGLE_SHEETS_EPOCH_UTC_MS + serial * MS_PER_DAY;
    const parsed = new Date(ms);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: `"${raw}" is not a valid date serial number` };
    }
    return { ok: true, value: parsed.toISOString() };
  }

  return { ok: false, reason: `"${raw}" is not a recognized date or datetime value` };
}
