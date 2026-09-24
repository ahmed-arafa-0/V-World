import { isPlaceholder, normalizeDate } from '@veoullas-world/sheet-schema';
import type { KeyMutex } from '../repositories/key-mutex.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import {
  calendarDateKey,
  getAuthoritativeTimeZone,
} from '../services/authoritative-time.service.js';

/** Everything a world mutation needs. `userId` always comes from the resolved owner session. */
export interface WorldCtx {
  gateway: SheetGateway;
  mutex: KeyMutex;
  userId: string;
  now: Date;
  /** Injectable randomness (mailbox initial-language pick) so tests are deterministic. */
  random?: () => number;
  /** Real-weather provider (Open-Meteo in production, a stub in tests). */
  weather?: import('./weather.js').WeatherProvider;
}

/** The sentinel Ahmed's workbook uses for "available from the first visit". */
export const FIRST_VISIT_SENTINEL = '<FIRST_VISIT>';

/** A value the runtime may show: not blank and not an un-replaced `<PLACEHOLDER>`. */
export function usable(value: string | undefined | null): value is string {
  if (value === undefined || value === null) return false;
  const trimmed = value.trim();
  return trimmed !== '' && !isPlaceholder(trimmed);
}

export function isFirstVisitSentinel(raw: string | undefined): boolean {
  return (raw ?? '').trim() === FIRST_VISIT_SENTINEL;
}

export function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!usable(raw)) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export interface DayClock {
  timeZone: string;
  /** Authoritative calendar day, `YYYY-MM-DD`. */
  today: string;
}

export async function getDayClock(gateway: SheetGateway, now: Date): Promise<DayClock> {
  const timeZone = await getAuthoritativeTimeZone(gateway);
  return { timeZone, today: calendarDateKey(now, timeZone) };
}

/**
 * Resolves a scheduled-date cell to an authoritative `YYYY-MM-DD` key:
 * - blank / `<FIRST_VISIT>` → `null` (no calendar restriction);
 * - unparseable/other placeholder → `'invalid'` (treated as not yet scheduled);
 * - a date-only value (ISO date or Sheets serial with no time) → its calendar day as written;
 * - a timestamp → the authoritative-timezone day it falls in.
 */
export function scheduledDayKey(
  raw: string | undefined,
  timeZone: string,
): string | null | 'invalid' {
  if (!raw || raw.trim() === '' || isFirstVisitSentinel(raw)) return null;
  const normalized = normalizeDate(raw);
  if (!normalized.ok || normalized.value === '') return 'invalid';
  if (normalized.value.endsWith('T00:00:00.000Z')) return normalized.value.slice(0, 10);
  return calendarDateKey(new Date(normalized.value), timeZone);
}

/** True once a scheduled date has arrived (or is unrestricted). Invalid dates are never due. */
export function isScheduledDue(raw: string | undefined, clock: DayClock): boolean {
  const key = scheduledDayKey(raw, clock.timeZone);
  if (key === null) return true;
  if (key === 'invalid') return false;
  return key <= clock.today;
}

export function isScheduledToday(raw: string | undefined, clock: DayClock): boolean {
  const key = scheduledDayKey(raw, clock.timeZone);
  return key !== null && key !== 'invalid' && key === clock.today;
}

/** Requested locale, English, then authored Arabic. Always reports the actual text direction. */
export function pickLocaleRow<T extends { locale: string }>(
  rows: T[],
  locale: string,
): { row: T; usedLocale: string } | null {
  const exact = rows.find((r) => r.locale === locale);
  if (exact) return { row: exact, usedLocale: locale };
  const english = rows.find((r) => r.locale === 'en');
  const fallback = english ?? rows.find((r) => r.locale === 'ar-EG');
  return fallback ? { row: fallback, usedLocale: fallback.locale } : null;
}

export function directionFor(locale: string): 'ltr' | 'rtl' {
  return locale === 'ar-EG' ? 'rtl' : 'ltr';
}

export function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = out.get(key);
    if (bucket) bucket.push(row);
    else out.set(key, [row]);
  }
  return out;
}

export async function readAppConfig(gateway: SheetGateway): Promise<Map<string, string>> {
  const result = await gateway.readTab('01_APP_CONFIG');
  const out = new Map<string, string>();
  for (const row of result.rows) {
    if (row.values.enabled === true && usable(row.raw.value))
      out.set(row.primaryKeyValue ?? '', row.raw.value!.trim());
  }
  return out;
}

/** `available_from` reached (or unrestricted) and `available_to` (inclusive) not yet passed. */
export function isWithinWindow(
  from: string | undefined,
  to: string | undefined,
  clock: DayClock,
): boolean {
  if (!isScheduledDue(from, clock)) return false;
  if (!usable(to)) return true;
  const end = scheduledDayKey(to, clock.timeZone);
  if (end === null || end === 'invalid') return true;
  return clock.today <= end;
}
