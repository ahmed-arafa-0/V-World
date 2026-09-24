import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { AppError } from '../errors/app-error.js';
import { calendarDateKey, getAuthoritativeTimeZone } from './authoritative-time.service.js';
import type { KeyMutex } from '../repositories/key-mutex.js';

export interface PlayerKeySummary {
  userId: string;
  keyTypeId: string;
  quantityFound: number;
  quantitySpent: number;
  quantityAvailable: number;
  lastFoundAt: string;
  lastAwardDate: string;
}

/** `|` matches the real live Sheet's existing convention (e.g. `veoulla|key_shell`) — never `:`. */
function keyRowKey(userId: string, keyTypeId: string): string {
  return `${userId}|${keyTypeId}`;
}

function toSummary(raw: Record<string, string>): PlayerKeySummary {
  return {
    userId: raw.user_id ?? '',
    keyTypeId: raw.key_type_id ?? '',
    quantityFound: Number(raw.quantity_found ?? '0') || 0,
    quantitySpent: Number(raw.quantity_spent ?? '0') || 0,
    quantityAvailable: Number(raw.quantity_available ?? '0') || 0,
    lastFoundAt: raw.last_found_at ?? '',
    lastAwardDate: raw.last_award_date ?? '',
  };
}

/** All `25_PLAYER_KEYS` rows for one user. Never reads another user's rows. */
export async function getPlayerKeys(
  gateway: SheetGateway,
  userId: string,
): Promise<PlayerKeySummary[]> {
  const result = await gateway.readTab('25_PLAYER_KEYS');
  return result.rows.filter((r) => r.raw.user_id === userId).map((r) => toSummary(r.raw));
}

export interface AwardKeyInput {
  userId: string;
  keyTypeId: string;
  quantity: number;
  /** Doubles as both the idempotency key and the audit trail (`25_PLAYER_KEYS.last_source_id`). */
  transactionId: string;
  now: Date;
}

export type AwardKeyReason = 'created' | 'applied' | 'duplicate_transaction' | 'daily_cap_reached';

export interface AwardKeyResult {
  applied: boolean;
  reason: AwardKeyReason;
  key: PlayerKeySummary;
}

/**
 * Awards `quantity` of one key shape, idempotently, enforcing the Living
 * Bible §10A rule that "Veoulla can collect no more than one copy of the
 * same location-key shape per calendar day" (using the Sheet-configured
 * authoritative timezone, never the server process's local clock):
 *
 * - No existing row → the row is created (first-ever award for this shape).
 * - An existing row whose `last_award_date` is a different authoritative
 *   day → the award applies and that becomes the new `last_award_date`.
 * - An existing row already awarded today, with the SAME `transactionId`
 *   as last time → a retry of the identical request; returns the current
 *   state unchanged (`duplicate_transaction`) rather than double-awarding.
 * - An existing row already awarded today, with a DIFFERENT
 *   `transactionId` → a genuinely new same-day attempt; rejected
 *   (`daily_cap_reached`) without changing any quantity.
 *
 * Guarded by `mutex` so two concurrent requests for the same
 * `(userId, keyTypeId)` cannot both read the same starting state and both
 * "win" — mirroring how `sheet-gateway.ts` already serializes writes to
 * the same primary key internally, but for this read-decide-write sequence
 * spanning two gateway calls.
 */
export async function awardKey(
  gateway: SheetGateway,
  mutex: KeyMutex,
  input: AwardKeyInput,
): Promise<AwardKeyResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError('invalid_request', 'quantity must be a positive integer.');
  }

  return mutex.run(`25_PLAYER_KEYS:${keyRowKey(input.userId, input.keyTypeId)}`, async () => {
    const timeZone = await getAuthoritativeTimeZone(gateway);
    const today = calendarDateKey(input.now, timeZone);
    const key = keyRowKey(input.userId, input.keyTypeId);
    const existing = await gateway.findByPrimaryKey('25_PLAYER_KEYS', key, { bypass: true });

    if (!existing) {
      const patch: Record<string, string> = {
        user_id: input.userId,
        key_type_id: input.keyTypeId,
        quantity_found: String(input.quantity),
        quantity_spent: '0',
        quantity_available: String(input.quantity),
        last_found_at: input.now.toISOString(),
        last_source_id: input.transactionId,
        last_award_date: today,
        updated_at: input.now.toISOString(),
      };
      await gateway.appendRow('25_PLAYER_KEYS', { user_key_type: key, ...patch });
      return { applied: true, reason: 'created', key: toSummary(patch) };
    }

    const raw = existing.row.raw;
    // Retry identity is checked before the calendar cap. Otherwise the
    // exact same transaction retried after midnight would be awarded a
    // second time merely because its authoritative date changed.
    if (raw.last_source_id === input.transactionId) {
      return { applied: false, reason: 'duplicate_transaction', key: toSummary(raw) };
    }
    if (raw.last_award_date === today) {
      return { applied: false, reason: 'daily_cap_reached', key: toSummary(raw) };
    }

    const found = (Number(raw.quantity_found ?? '0') || 0) + input.quantity;
    const spent = Number(raw.quantity_spent ?? '0') || 0;
    const patch: Record<string, string> = {
      quantity_found: String(found),
      quantity_available: String(found - spent),
      last_found_at: input.now.toISOString(),
      last_source_id: input.transactionId,
      last_award_date: today,
      updated_at: input.now.toISOString(),
    };
    await gateway.updateByPrimaryKey('25_PLAYER_KEYS', key, patch);
    return { applied: true, reason: 'applied', key: toSummary({ ...raw, ...patch }) };
  });
}

export interface SpendKeyInput {
  userId: string;
  keyTypeId: string;
  quantity: number;
  transactionId: string;
  now: Date;
}

export type SpendKeyReason = 'applied' | 'duplicate_transaction' | 'insufficient_keys';

export interface SpendKeyResult {
  applied: boolean;
  reason: SpendKeyReason;
  key: PlayerKeySummary | null;
}

/**
 * Spends `quantity` of one key shape. Idempotency here is a documented,
 * intentionally simpler model than `awardKey`'s date-based one: spending
 * isn't calendar-scoped, and `25_PLAYER_KEYS` has no dedicated per-spend
 * transaction ledger column (only `last_source_id`, shared with awards).
 * This reuses that same column as a single "most recently applied
 * transaction" marker: an immediate retry with the same `transactionId`
 * (the realistic case — a flaky network causing the client to resubmit
 * before anything else touches this row) is caught and returned unchanged.
 * A `transactionId` retried much later, after a different transaction has
 * since touched the same row, is NOT distinguished from a new spend by
 * this simplified model — a full audit-ledger tab would be needed to close
 * that gap, and none exists in the current 42-tab schema (still explicitly
 * "Open" per the Living Bible §3A). Flagged here rather than solved by
 * inventing an unreviewed schema column.
 */
export async function spendKey(
  gateway: SheetGateway,
  mutex: KeyMutex,
  input: SpendKeyInput,
): Promise<SpendKeyResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError('invalid_request', 'quantity must be a positive integer.');
  }

  return mutex.run(`25_PLAYER_KEYS:${keyRowKey(input.userId, input.keyTypeId)}`, async () => {
    const key = keyRowKey(input.userId, input.keyTypeId);
    const existing = await gateway.findByPrimaryKey('25_PLAYER_KEYS', key, { bypass: true });
    if (!existing) {
      return { applied: false, reason: 'insufficient_keys', key: null };
    }

    const raw = existing.row.raw;
    if (raw.last_source_id === input.transactionId) {
      return { applied: false, reason: 'duplicate_transaction', key: toSummary(raw) };
    }

    const available = Number(raw.quantity_available ?? '0') || 0;
    if (available < input.quantity) {
      return { applied: false, reason: 'insufficient_keys', key: toSummary(raw) };
    }

    const spent = (Number(raw.quantity_spent ?? '0') || 0) + input.quantity;
    const patch: Record<string, string> = {
      quantity_spent: String(spent),
      quantity_available: String(available - input.quantity),
      last_source_id: input.transactionId,
      updated_at: input.now.toISOString(),
    };
    await gateway.updateByPrimaryKey('25_PLAYER_KEYS', key, patch);
    return { applied: true, reason: 'applied', key: toSummary({ ...raw, ...patch }) };
  });
}
