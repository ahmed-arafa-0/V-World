import type { SafeSessionSummary, SessionKind, SessionStatus } from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Session IDs are minted deterministically from the flow name and the
 * client's stable attempt ID (`sess_gate_<attemptId>` / `sess_admin_<attemptId>`).
 * This gives two things for free: idempotent session creation via
 * `appendIfAbsent` (a retry of the same attempt reuses the original
 * session instead of creating a second one), and a self-describing ID that
 * lets session resolution verify which kind a session belongs to without
 * an extra 02_USERS read or a new Sheet column.
 */
export function buildSessionId(flow: 'gate' | 'admin', attemptId: string): string {
  return `sess_${flow}_${attemptId}`;
}

export function deriveSessionKindFromId(sessionId: string): SessionKind | null {
  if (sessionId.startsWith('sess_gate_')) return 'owner';
  if (sessionId.startsWith('sess_admin_')) return 'admin';
  return null;
}

export interface CreateSessionInput {
  sessionId: string;
  userId: string;
  ip: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  /** Owner sessions only: a safe, non-secret Gate configuration identifier — never the digits themselves. */
  gateCodeId?: string;
  currentLocation?: string;
  currentStoryBeat?: string;
}

/**
 * Idempotently creates (or reconciles) a 06_SESSIONS row. A retry with the
 * same `sessionId` (i.e. the same client attempt ID) returns the original
 * row untouched rather than creating a duplicate.
 */
export async function createOrReconcileSession(
  gateway: SheetGateway,
  input: CreateSessionInput,
): Promise<{ created: boolean; row: Record<string, string> }> {
  return gateway.appendIfAbsent('06_SESSIONS', input.sessionId, () => ({
    session_id: input.sessionId,
    user_id: input.userId,
    created_at: input.createdAt.toISOString(),
    last_seen_at: input.createdAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
    ip_address: input.ip,
    device_id: input.deviceId,
    status: 'active',
    gate_code_id: input.gateCodeId ?? '',
    current_location: input.currentLocation ?? '',
    current_story_beat: input.currentStoryBeat ?? '',
  }));
}

export async function touchLastSeen(
  gateway: SheetGateway,
  sessionId: string,
  now: Date,
): Promise<void> {
  await gateway.updateByPrimaryKey('06_SESSIONS', sessionId, {
    last_seen_at: now.toISOString(),
  });
}

export function toSafeSessionSummary(
  row: Record<string, string>,
  kind: SessionKind,
): SafeSessionSummary {
  return {
    kind,
    userId: row.user_id ?? '',
    status: (row.status as SessionStatus) ?? 'active',
    createdAt: row.created_at ?? '',
    expiresAt: row.expires_at ?? '',
    lastSeenAt: row.last_seen_at ?? '',
  };
}
