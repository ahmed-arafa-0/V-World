import type { PlayerAchievementView } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

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

export interface PlayerKeyRow {
  userId: string;
  keyTypeId: string;
  quantityFound: number;
  quantitySpent: number;
  quantityAvailable: number;
  lastFoundAt: string;
  lastAwardDate: string;
}

export interface PlayerStateResponse {
  ok: true;
  progress: PlayerProgressRow[];
  keys: PlayerKeyRow[];
  achievements: unknown[];
}

export type PlayerStateResult =
  | ApiFetchResult<PlayerStateResponse>
  | { status: 'cached'; data: PlayerStateResponse; message: string };

export interface CheckpointRequest {
  routeId: string;
  beatId: string;
  checkpoint: boolean;
  currentLocation?: string;
}

type PendingMutation =
  | { id: string; kind: 'checkpoint'; body: CheckpointRequest }
  | { id: string; kind: 'beach-shell'; body: Record<string, never> };

const CACHE_PREFIX = 'vw_player_state_v1:';
const QUEUE_PREFIX = 'vw_player_pending_v1:';

function storageKey(prefix: string, userId: string): string {
  return `${prefix}${encodeURIComponent(userId)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache/queue persistence is an enhancement; blocked storage must not trap the story.
  }
}

function readQueue(userId: string): PendingMutation[] {
  const value = readJson<unknown>(storageKey(QUEUE_PREFIX, userId));
  return Array.isArray(value) ? (value as PendingMutation[]) : [];
}

function writeQueue(userId: string, queue: PendingMutation[]): void {
  writeJson(storageKey(QUEUE_PREFIX, userId), queue);
}

function enqueue(userId: string, mutation: PendingMutation): void {
  const queue = readQueue(userId);
  const withoutOlderEquivalent = queue.filter((item) => item.id !== mutation.id);
  withoutOlderEquivalent.push(mutation);
  writeQueue(userId, withoutOlderEquivalent);
}

interface MutationAttempt<T> {
  result: ApiFetchResult<T>;
  retryable: boolean;
}

/** Bounded deadlines: a stalled request must fail visibly rather than hold the player on a spinner. */
const READ_TIMEOUT_MS = 12_000;
const WRITE_TIMEOUT_MS = 30_000;
/** Mutable only so tests can remove the waits. */
export const playerClientTuning = { readRetryDelaysMs: [700, 1800] };

async function postJson<T>(url: string, body: unknown): Promise<MutationAttempt<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `Backend responded with status ${response.status}`;
      try {
        const parsed: unknown = await response.json();
        if (
          parsed &&
          typeof parsed === 'object' &&
          'message' in parsed &&
          typeof parsed.message === 'string'
        ) {
          message = parsed.message;
        }
      } catch {
        // Response was not JSON; retain the safe status message.
      }
      return {
        result: { status: 'offline', message },
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    return { result: { status: 'online', data: (await response.json()) as T }, retryable: false };
  } catch {
    return {
      result: { status: 'offline', message: 'Backend is unreachable' },
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendPending(mutation: PendingMutation): Promise<boolean> {
  // A queue entry written by a build that still had the retired client-chosen award endpoint is dropped.
  if ((mutation.kind as string) === 'key-award') return true;
  const route =
    mutation.kind === 'checkpoint' ? '/api/player/checkpoint' : '/api/world/beach/shell';
  const attempt = await postJson(route, mutation.body);
  return attempt.result.status === 'online';
}

/** Replays queued mutations in order and removes only confirmed successes. */
export async function flushPendingPlayerMutations(userId: string): Promise<number> {
  const queue = readQueue(userId);
  if (queue.length === 0) return 0;
  const remaining: PendingMutation[] = [];
  let applied = 0;
  for (const mutation of queue) {
    if (await sendPending(mutation)) applied += 1;
    else remaining.push(mutation);
  }
  writeQueue(userId, remaining);
  return applied;
}

export function pendingPlayerMutationCount(userId: string): number {
  return readQueue(userId).length;
}

/**
 * Reads Sheet-authoritative state. When `userId` is supplied, pending writes
 * for that same authenticated user are reconciled first and successful
 * reads refresh a per-user local cache. A network failure may return that
 * same user's cache, never another user's data.
 */
export async function fetchPlayerState(userId?: string): Promise<PlayerStateResult> {
  if (userId) await flushPendingPlayerMutations(userId);
  try {
    let data: PlayerStateResponse | null = null;
    let failure: Error = new Error('Backend is unreachable');
    for (let tryNo = 0; tryNo <= playerClientTuning.readRetryDelaysMs.length && !data; tryNo++) {
      if (tryNo > 0)
        await new Promise((r) => setTimeout(r, playerClientTuning.readRetryDelaysMs[tryNo - 1]));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
      try {
        const response = await fetch('/api/player/state', { signal: controller.signal });
        if (response.ok) {
          data = (await response.json()) as PlayerStateResponse;
        } else {
          failure = new Error(`Backend responded with status ${response.status}`);
          // Only a transient failure is worth another try; an auth or client error will not change.
          if (response.status !== 429 && response.status < 500) break;
        }
      } catch {
        failure = new Error(controller.signal.aborted ? 'The request timed out' : failure.message);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!data) throw failure;
    if (userId) writeJson(storageKey(CACHE_PREFIX, userId), data);
    return { status: 'online', data };
  } catch (error) {
    if (userId) {
      const cached = readJson<PlayerStateResponse>(storageKey(CACHE_PREFIX, userId));
      if (cached) {
        return {
          status: 'cached',
          data: cached,
          message: error instanceof Error ? error.message : 'Backend is unreachable',
        };
      }
    }
    return {
      status: 'offline',
      message: error instanceof Error ? error.message : 'Backend is unreachable',
    };
  }
}

export interface PlayerAchievementsResponse {
  ok: true;
  achievements: PlayerAchievementView[];
}

/** The player-facing achievements list — read on demand when the panel opens, not on every load. */
export function fetchPlayerAchievements(
  locale: string,
): Promise<ApiFetchResult<PlayerAchievementsResponse>> {
  return fetchJson<PlayerAchievementsResponse>(
    `/api/player/achievements?locale=${encodeURIComponent(locale)}`,
  );
}

export async function postCheckpoint(
  body: CheckpointRequest,
  userId?: string,
): Promise<ApiFetchResult<{ ok: true; applied: boolean; reason: string }>> {
  const attempt = await postJson<{ ok: true; applied: boolean; reason: string }>(
    '/api/player/checkpoint',
    body,
  );
  if (attempt.result.status === 'offline' && attempt.retryable && userId) {
    enqueue(userId, { id: `checkpoint:${body.routeId}`, kind: 'checkpoint', body });
  }
  return attempt.result;
}

/**
 * The Beach shell: the browser only reports the tap. The server checks the
 * player is past the Gate/naming, reads the reward from the Sheet's key rule,
 * and pays it once. Safe to retry, so a transient failure is queued.
 */
export async function postBeachShell(
  userId?: string,
): Promise<ApiFetchResult<{ applied: boolean; reason: string; keyTypeId: string }>> {
  const attempt = await postJson<{ applied: boolean; reason: string; keyTypeId: string }>(
    '/api/world/beach/shell',
    {},
  );
  if (attempt.result.status === 'offline' && attempt.retryable && userId) {
    enqueue(userId, { id: 'beach-shell', kind: 'beach-shell', body: {} });
  }
  return attempt.result;
}
