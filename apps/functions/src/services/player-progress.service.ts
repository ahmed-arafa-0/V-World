import type { SheetGateway } from '../repositories/sheet-gateway.js';

export interface PlayerProgressRow {
  userId: string;
  routeId: string;
  status: string;
  currentBeatId: string;
  lastCheckpointId: string;
  currentLocation: string;
  startedAt: string;
  completedAt: string;
  updatedAt: string;
}

/** `|` matches the real live Sheet's existing convention (e.g. `veoulla|first_journey`) — never `:`. */
function userRouteKey(userId: string, routeId: string): string {
  return `${userId}|${routeId}`;
}

function toPlayerProgressRow(raw: Record<string, string>): PlayerProgressRow {
  return {
    userId: raw.user_id ?? '',
    routeId: raw.story_route_id ?? '',
    status: raw.status ?? '',
    currentBeatId: raw.current_beat_id ?? '',
    lastCheckpointId: raw.last_checkpoint_id ?? '',
    currentLocation: raw.current_location ?? '',
    startedAt: raw.started_at ?? '',
    completedAt: raw.completed_at ?? '',
    updatedAt: raw.updated_at ?? '',
  };
}

/** All `24_PLAYER_PROGRESS` rows (one per route) for one user. Never reads another user's rows. */
export async function getPlayerProgress(
  gateway: SheetGateway,
  userId: string,
): Promise<PlayerProgressRow[]> {
  const result = await gateway.readTab('24_PLAYER_PROGRESS');
  return result.rows.filter((r) => r.raw.user_id === userId).map((r) => toPlayerProgressRow(r.raw));
}

export interface CheckpointInput {
  userId: string;
  routeId: string;
  beatId: string;
  /** True for a real checkpoint (safe resume point); false for a lighter-weight "current beat" update that isn't itself resumable. */
  checkpoint: boolean;
  currentLocation?: string;
  now: Date;
}

export interface CheckpointResult {
  applied: true;
  reason: 'created' | 'applied';
  progress: PlayerProgressRow;
}

/**
 * Idempotently records story progress. Creating the row (`first checkpoint
 * for this route`) and updating an existing one both go through the same
 * `updateByPrimaryKey`/`appendRow` primitives the rest of this backend
 * already uses — no new Sheet tab or column is introduced. Setting the same
 * beat twice (a genuine retry) is a harmless no-op write, matching every
 * other idempotent upsert in this codebase (e.g. `access-config-seed.service.ts`).
 *
 * Known limitation: this does not protect against an out-of-order write
 * from a stale, slow, concurrent request moving `current_beat_id` backward
 * — that would need a monotonic ordering column `24_PLAYER_PROGRESS`
 * doesn't currently have (the Sheet workbook/tab architecture is still
 * explicitly "Open" per the Living Bible §3A). Flagged rather than solved
 * by inventing an unreviewed schema column.
 */
export async function checkpointProgress(
  gateway: SheetGateway,
  input: CheckpointInput,
): Promise<CheckpointResult> {
  const key = userRouteKey(input.userId, input.routeId);
  const nowIso = input.now.toISOString();
  const existing = await gateway.findByPrimaryKey('24_PLAYER_PROGRESS', key, { bypass: true });

  if (!existing) {
    const patch: Record<string, string> = {
      user_id: input.userId,
      story_route_id: input.routeId,
      status: 'in_progress',
      current_beat_id: input.beatId,
      last_checkpoint_id: input.checkpoint ? input.beatId : '',
      current_location: input.currentLocation ?? '',
      started_at: nowIso,
      completed_at: '',
      updated_at: nowIso,
    };
    await gateway.appendRow('24_PLAYER_PROGRESS', { user_route_key: key, ...patch });
    return { applied: true, reason: 'created', progress: toPlayerProgressRow(patch) };
  }

  const raw = existing.row.raw;
  const patch: Record<string, string> = {
    current_beat_id: input.beatId,
    current_location: input.currentLocation ?? raw.current_location ?? '',
    updated_at: nowIso,
  };
  if (input.checkpoint) {
    patch.last_checkpoint_id = input.beatId;
  }

  await gateway.updateByPrimaryKey('24_PLAYER_PROGRESS', key, patch);
  return { applied: true, reason: 'applied', progress: toPlayerProgressRow({ ...raw, ...patch }) };
}

export interface CompleteRouteResult {
  applied: boolean;
  reason: 'completed' | 'already_completed' | 'not_started';
  progress: PlayerProgressRow | null;
}

/**
 * Marks a route `completed`, once. A retry (or any call once the route is
 * already `completed`) is a safe no-op that returns the existing state —
 * this is intentionally NOT where `first_journey_completed`/`map_unlocked`
 * are set (Living Bible §18J: that specific flip happens only at the real
 * Map-unlock moment, built in a later milestone). This function is generic
 * route-completion machinery any future route can reuse.
 */
export async function completeRoute(
  gateway: SheetGateway,
  userId: string,
  routeId: string,
  now: Date,
): Promise<CompleteRouteResult> {
  const key = userRouteKey(userId, routeId);
  const existing = await gateway.findByPrimaryKey('24_PLAYER_PROGRESS', key, { bypass: true });
  if (!existing) {
    return { applied: false, reason: 'not_started', progress: null };
  }

  const raw = existing.row.raw;
  if (raw.status === 'completed') {
    return { applied: false, reason: 'already_completed', progress: toPlayerProgressRow(raw) };
  }

  const patch = {
    status: 'completed',
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  await gateway.updateByPrimaryKey('24_PLAYER_PROGRESS', key, patch);
  return {
    applied: true,
    reason: 'completed',
    progress: toPlayerProgressRow({ ...raw, ...patch }),
  };
}
