import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * The 11 accepted M02 `entry_event_type` values (mirrors
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
  | 'session_terminated';

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
    language: fields.language ?? '',
    route: fields.route ?? '',
    details_json: JSON.stringify(fields.details ?? {}),
  }));

  return { created: result.created, logId };
}
