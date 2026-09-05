import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { appendEntryLogIfAbsent, type EntryEventType } from './entry-log.service.js';

export type AuthFlow = 'gate' | 'admin';

export interface RateLimitEntry {
  eventType: EntryEventType;
  timestampMs: number;
}

export interface RateLimitDecision {
  blocked: boolean;
  maxAttempts: number;
  remainingAttempts: number;
  cooldownSeconds: number;
  /** Set only while `blocked` is true. Pinned to the FIRST rate-limited marker of the current episode — later repeated blocked checks never push it further out. */
  cooldownEndsAtMs: number | null;
  retryAfterSeconds: number | null;
}

/**
 * Pure boundary logic — no Sheet access, fully deterministic, directly
 * unit-testable. `entries` must already be filtered to one (flow, scope)
 * pair and sorted ascending by timestamp; only `${flow}_success`,
 * `${flow}_failure`, and `${flow}_rate_limited` events belong in it.
 *
 * Chosen boundary behavior (documented per the M02-B2 spec's explicit
 * either/or): the request that causes the trailing failure count to REACH
 * `maxAttempts` still receives the normal generic authentication failure —
 * not a block — because this function is evaluated once, BEFORE that
 * attempt's credential check, using only failures recorded before it. The
 * NEXT request (whichever one arrives next) sees `maxAttempts` trailing
 * failures with no rate-limited marker yet, is blocked, and is the one that
 * causes a `${flow}_rate_limited` log to be appended. A cooldown, once
 * engaged, is never extended by later blocked requests: `cooldownEndsAtMs`
 * is always derived from the episode's FIRST rate-limited event, so
 * repeated attempts during an active cooldown do not push the end time
 * out — this is what keeps "must not permanently extend cooldown" true
 * even though every blocked attempt still gets its own audit log row.
 * Once now passes that cooldown end, the whole chain (failures AND the
 * cooldown marker before it) is discarded and counting restarts at zero.
 */
export function computeRateLimitDecision(
  entries: RateLimitEntry[],
  maxAttempts: number,
  cooldownSeconds: number,
  nowMs: number,
): RateLimitDecision {
  let consecutiveFailures = 0;
  let activeCooldownEndsAtMs: number | null = null;

  for (const entry of entries) {
    if (entry.eventType.endsWith('_success')) {
      consecutiveFailures = 0;
      activeCooldownEndsAtMs = null;
      continue;
    }

    if (entry.eventType.endsWith('_failure')) {
      consecutiveFailures += 1;
      continue;
    }

    if (entry.eventType.endsWith('_rate_limited')) {
      if (activeCooldownEndsAtMs === null) {
        activeCooldownEndsAtMs = entry.timestampMs + cooldownSeconds * 1000;
      }
      if (nowMs >= activeCooldownEndsAtMs) {
        // This past episode's cooldown has fully expired — the whole chain
        // (its failures and its cooldown marker) resets; counting restarts
        // fresh from whatever comes after this point in the log.
        consecutiveFailures = 0;
        activeCooldownEndsAtMs = null;
      }
    }
  }

  if (activeCooldownEndsAtMs !== null && nowMs < activeCooldownEndsAtMs) {
    return {
      blocked: true,
      maxAttempts,
      remainingAttempts: 0,
      cooldownSeconds,
      cooldownEndsAtMs: activeCooldownEndsAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((activeCooldownEndsAtMs - nowMs) / 1000)),
    };
  }

  if (consecutiveFailures >= maxAttempts) {
    const cooldownEndsAtMs = nowMs + cooldownSeconds * 1000;
    return {
      blocked: true,
      maxAttempts,
      remainingAttempts: 0,
      cooldownSeconds,
      cooldownEndsAtMs,
      retryAfterSeconds: cooldownSeconds,
    };
  }

  return {
    blocked: false,
    maxAttempts,
    remainingAttempts: Math.max(0, maxAttempts - consecutiveFailures),
    cooldownSeconds,
    cooldownEndsAtMs: null,
    retryAfterSeconds: null,
  };
}

function parseRelevantEntries(
  raw: string[][],
  flow: AuthFlow,
  ip: string,
  deviceId: string,
): RateLimitEntry[] {
  const [header, ...rows] = raw;
  if (!header) return [];

  const eventTypeIdx = header.indexOf('event_type');
  const timestampIdx = header.indexOf('timestamp');
  const ipIdx = header.indexOf('ip_address');
  const deviceIdIdx = header.indexOf('device_id');

  const relevantTypes = new Set<string>([
    `${flow}_success`,
    `${flow}_failure`,
    `${flow}_rate_limited`,
  ]);

  const entries: RateLimitEntry[] = [];
  for (const row of rows) {
    const eventType = row[eventTypeIdx];
    if (!eventType || !relevantTypes.has(eventType)) continue;
    if (row[ipIdx] !== ip || row[deviceIdIdx] !== deviceId) continue;
    const timestampMs = Date.parse(row[timestampIdx] ?? '');
    if (!Number.isFinite(timestampMs)) continue;
    entries.push({ eventType: eventType as EntryEventType, timestampMs });
  }

  entries.sort((a, b) => a.timestampMs - b.timestampMs);
  return entries;
}

/**
 * Reads the persistent rate-limit state for one (flow, ip, deviceId) scope
 * from 05_ENTRY_LOGS — always bypassing the read cache, since a stale
 * 60-second-old view could under- or over-count attempts. If the decision
 * is `blocked`, appends the flow's `_rate_limited` audit log, idempotently
 * keyed by `blockedAttemptId` (a retry of the same blocked attempt never
 * duplicates the log row).
 */
export async function evaluateRateLimit(
  gateway: SheetGateway,
  flow: AuthFlow,
  ip: string,
  deviceId: string,
  maxAttempts: number,
  cooldownSeconds: number,
  now: Date,
  blockedAttemptId: string,
): Promise<RateLimitDecision> {
  const raw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
  const entries = parseRelevantEntries(raw, flow, ip, deviceId);
  const decision = computeRateLimitDecision(entries, maxAttempts, cooldownSeconds, now.getTime());

  if (decision.blocked) {
    await appendEntryLogIfAbsent(gateway, `log_${flow}_ratelimited_${blockedAttemptId}`, {
      eventType: `${flow}_rate_limited`,
      accessResult: 'rate_limited',
      timestamp: now.toISOString(),
      ip,
      deviceId,
      details: { cooldownSeconds },
    });
  }

  return decision;
}
