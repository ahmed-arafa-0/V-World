import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Reads `01_APP_CONFIG.authoritative_time_zone` — the same config key
 * `bootstrap.service.ts` already exposes to the frontend — so every
 * server-side "what day is it" decision (daily key caps, future birthday
 * phase math) uses the one Sheet-configured timezone rather than the
 * server process's own local/UTC clock. Defaults to `'UTC'` exactly like
 * the bootstrap response does, so behavior is consistent even before
 * Ahmed configures the row.
 */
export async function getAuthoritativeTimeZone(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<string> {
  const result = await gateway.readTab('01_APP_CONFIG', options);
  const match = result.rows.find(
    (r) => r.primaryKeyValue === 'authoritative_time_zone' && r.values.enabled === true,
  );
  const value = typeof match?.raw.value === 'string' ? match.raw.value.trim() : '';
  return value || 'UTC';
}

/**
 * The authoritative calendar date (`YYYY-MM-DD`) for `date` in `timeZone`,
 * computed via `Intl.DateTimeFormat` (no external timezone-database
 * dependency needed — Node's built-in ICU data covers every IANA zone).
 * This is the single source of "what day is it" for any same-shape daily
 * limit (Living Bible §10A: "no more than one copy of the same
 * location-key shape per calendar day") — never the server process's own
 * local date, which could differ from the configured authoritative zone.
 */
export function calendarDateKey(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA formats as YYYY-MM-DD directly.
    return formatter.format(date);
  } catch {
    // An invalid/unsupported IANA zone string in the Sheet must never crash
    // a reward mutation — fall back to UTC rather than throwing.
    return calendarDateKey(date, 'UTC');
  }
}
