import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * The accepted `entry_event_type` values: the 11 M02 access values plus the two Phase 2
 * events (`first_journey_completed`, `song_request`; see scripts/seed-phase2-config.mjs) (mirrors
 * scripts/seed-m02-access-config.mjs and 39_VALIDATION_LISTS).
 */
export type EntryEventType =
  | 'page_open'
  | 'gate_failure'
  | 'gate_success'
  | 'gate_rate_limited'
  | 'admin_failure'
  | 'admin_success'
  | 'admin_rate_limited'
  | 'session_resume'
  | 'session_end'
  | 'session_expired'
  | 'session_terminated'
  | 'first_journey_completed'
  | 'song_request';

export interface EntryLogFields {
  eventType: EntryEventType;
  accessResult: string;
  timestamp: string;
  ip: string;
  deviceId?: string;
  userId?: string;
  sessionId?: string;
  language?: string;
  route?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * The app's five supported locale codes, duplicated from
 * `packages/contracts`'s `SUPPORTED_LOCALES` rather than imported, so this
 * backend-only normalization has no dependency on a frontend-facing
 * contract package staying in that exact shape.
 */
const SUPPORTED_LOG_LOCALES = ['en', 'ar-EG', 'it', 'el', 'fr'] as const;

/**
 * Normalizes a raw browser-supplied language tag (e.g. `navigator.language`,
 * which returns BCP-47 values like `"en-US"`) to one of the app's five
 * internal locale codes checked by `39_VALIDATION_LISTS`'s `locale` list, or
 * `""` when no supported locale can be inferred.
 *
 * This only affects newly written log rows — it never rewrites historical
 * `05_ENTRY_LOGS` data. Any Arabic variant (`ar`, `ar-SA`, `ar-EG`, ...)
 * normalizes to `ar-EG`, the only Arabic locale this app supports; every
 * other supported base language keeps its two-letter code; anything else
 * (e.g. `de-DE`) normalizes to `""`, matching the existing convention for
 * "no recorded language" already used by server-generated log rows.
 */
export function normalizeEntryLogLocale(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if ((SUPPORTED_LOG_LOCALES as readonly string[]).includes(value)) return value;

  const base = value.split('-')[0]!.toLowerCase();
  if (base === 'ar') return 'ar-EG';
  if (base === 'en' || base === 'it' || base === 'el' || base === 'fr') return base;
  return '';
}

/**
 * Appends one 05_ENTRY_LOGS row, keyed by a caller-supplied deterministic
 * `logId`. Idempotent: a retry with the same `logId` returns the original
 * row instead of creating a duplicate. Never logs submitted digits, the
 * current Gate value, a password, a cookie, an Authorization header, a
 * private key, a raw Google error, or a plaintext service value — callers
 * must only ever pass safe, non-secret fields here.
 */
export async function appendEntryLogIfAbsent(
  gateway: SheetGateway,
  logId: string,
  fields: EntryLogFields,
): Promise<{ created: boolean; logId: string }> {
  const result = await gateway.appendIfAbsent('05_ENTRY_LOGS', logId, () => ({
    log_id: logId,
    timestamp: fields.timestamp,
    user_id: fields.userId ?? '',
    session_id: fields.sessionId ?? '',
    event_type: fields.eventType,
    access_result: fields.accessResult,
    ip_address: fields.ip,
    user_agent: fields.userAgent ?? '',
    device_id: fields.deviceId ?? '',
    language: normalizeEntryLogLocale(fields.language),
    route: fields.route ?? '',
    details_json: JSON.stringify(fields.details ?? {}),
  }));

  return { created: result.created, logId };
}
