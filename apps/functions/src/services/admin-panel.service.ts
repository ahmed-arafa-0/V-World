import type {
  AdminDashboardResponse,
  AdminLogQuery,
  AdminLogRow,
  AdminLogsResponse,
  AdminPlayerAchievementRow,
  AdminPlayerCharacter,
  AdminPlayerInspectResponse,
  AdminPlayerKeyRow,
  AdminPlayerMessageRow,
  AdminPlayerProgressRow,
  AdminPlayerScoreRow,
} from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { computeSchemaHealth } from './schema-health.service.js';
import { getAuthoritativeTimeZone } from './authoritative-time.service.js';
import { getCharacterState } from './character-state.service.js';
import { getPlayerProgress } from './player-progress.service.js';
import { getPlayerKeys } from './player-keys.service.js';
import { getPlayerAchievements } from './player-achievements.service.js';
import { readAllWorldDocs } from '../world/state.js';

/** Tabs the dashboard reports cache freshness for — the ones every hot player action reads. */
const WATCHED_TABS = [
  '37_CHARACTER_STATE',
  '24_PLAYER_PROGRESS',
  '25_PLAYER_KEYS',
  '04_ADMIN_FLAGS',
  '06_SESSIONS',
  '05_ENTRY_LOGS',
] as const;

function toLogRow(raw: Record<string, string>): AdminLogRow {
  return {
    logId: raw.log_id ?? '',
    timestamp: raw.timestamp ?? '',
    userId: raw.user_id ?? '',
    sessionId: raw.session_id ?? '',
    eventType: raw.event_type ?? '',
    accessResult: raw.access_result ?? '',
    ip: raw.ip_address ?? '',
    userAgent: raw.user_agent ?? '',
    deviceId: raw.device_id ?? '',
    language: raw.language ?? '',
    route: raw.route ?? '',
  };
}

/**
 * Dashboard summary (M17): authoritative time, a Sheet-health summary (reusing the same computation
 * Schema Health already exposes), how many `06_SESSIONS` rows are genuinely active right now, the most
 * recent entry-log rows, and how fresh this process's own cached copy of the hottest tabs is — the most
 * honest, directly-observable reading of "pending sync" for a Sheet-backed system with no separate write
 * queue of its own (every write here is synchronous and already confirmed before it returns).
 */
export async function getAdminDashboard(
  gateway: SheetGateway,
  now: Date,
): Promise<AdminDashboardResponse> {
  const [timeZone, schemaHealth, sessions, logs] = await Promise.all([
    getAuthoritativeTimeZone(gateway),
    computeSchemaHealth(gateway),
    gateway.readTab('06_SESSIONS'),
    gateway.readTab('05_ENTRY_LOGS'),
  ]);

  const nowMs = now.getTime();
  const activeSessionCount = sessions.rows.filter((r) => {
    if (r.raw.status !== 'active') return false;
    const expiresAtMs = Date.parse(r.raw.expires_at ?? '');
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  }).length;

  const lastLogs = [...logs.rows]
    .sort((a, b) => Date.parse(b.raw.timestamp ?? '') - Date.parse(a.raw.timestamp ?? ''))
    .slice(0, 20)
    .map((r) => toLogRow(r.raw));

  const cacheAgeMs: Record<string, number> = {};
  for (const tab of WATCHED_TABS) {
    const age = gateway.tabAgeMs(tab);
    if (Number.isFinite(age)) cacheAgeMs[tab] = age;
  }

  return {
    ok: true,
    serverTime: now.toISOString(),
    timeZone,
    schemaHealth: schemaHealth.summary,
    activeSessionCount,
    lastLogs,
    cacheAgeMs,
  };
}

const MAX_LOG_LIMIT = 200;

/** Read-only, filtered/paginated `05_ENTRY_LOGS` view. Never mutates a row. */
export async function queryAdminLogs(
  gateway: SheetGateway,
  query: AdminLogQuery,
): Promise<AdminLogsResponse> {
  const result = await gateway.readTab('05_ENTRY_LOGS');
  const fromMs = query.from ? Date.parse(query.from) : NaN;
  const toMs = query.to ? Date.parse(query.to) : NaN;

  const matches = result.rows.filter((r) => {
    const raw = r.raw;
    if (query.eventType && raw.event_type !== query.eventType) return false;
    if (query.accessResult && raw.access_result !== query.accessResult) return false;
    if (query.ip && raw.ip_address !== query.ip) return false;
    if (query.userId && raw.user_id !== query.userId) return false;
    if (Number.isFinite(fromMs) || Number.isFinite(toMs)) {
      const at = Date.parse(raw.timestamp ?? '');
      if (!Number.isFinite(at)) return false;
      if (Number.isFinite(fromMs) && at < fromMs) return false;
      if (Number.isFinite(toMs) && at > toMs) return false;
    }
    return true;
  });

  matches.sort((a, b) => Date.parse(b.raw.timestamp ?? '') - Date.parse(a.raw.timestamp ?? ''));

  const limit = Math.min(Math.max(1, query.limit ?? 50), MAX_LOG_LIMIT);
  const offset = Math.max(0, query.offset ?? 0);
  const page = matches.slice(offset, offset + limit);

  return { ok: true, rows: page.map((r) => toLogRow(r.raw)), total: matches.length };
}

/**
 * Read-only aggregate view of one player for the Admin operator (M17: "Inspect player story, keys,
 * achievements, messages, Farm, characters, scores, and exhibits"). Unlike the general
 * `character-state.service.ts` read (which deliberately withholds `story_flags_json` from a
 * player-facing caller — see its own comment), this is the trusted Admin surface, so the raw
 * per-location JSON documents ARE included: that withholding rule exists to stop the story's own
 * secrets leaking back to the player it is about, not to hide operational state from Ahmed.
 */
export async function inspectPlayer(
  gateway: SheetGateway,
  userId: string,
): Promise<AdminPlayerInspectResponse> {
  const [characterRow, progress, keys, achievements, scores, messages, worldDocs] =
    await Promise.all([
      getCharacterState(gateway, userId, 'var'),
      getPlayerProgress(gateway, userId),
      getPlayerKeys(gateway, userId),
      getPlayerAchievements(gateway, userId),
      gateway.readTab('33_PLAYER_SCORES'),
      gateway.readTab('27_PLAYER_MESSAGES'),
      readAllWorldDocs(gateway, userId),
    ]);

  const character: AdminPlayerCharacter | null = characterRow
    ? {
        personalName: characterRow.personalName,
        selectedGender: characterRow.selectedGender,
        currentLocation: characterRow.currentLocation,
        updatedAt: characterRow.updatedAt,
      }
    : null;

  const progressRows: AdminPlayerProgressRow[] = progress.map((p) => ({
    routeId: p.routeId,
    status: p.status,
    currentBeatId: p.currentBeatId,
    currentLocation: p.currentLocation,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
  }));

  const keyRows: AdminPlayerKeyRow[] = keys.map((k) => ({
    keyTypeId: k.keyTypeId,
    quantityFound: k.quantityFound,
    quantitySpent: k.quantitySpent,
    quantityAvailable: k.quantityAvailable,
  }));

  const achievementRows: AdminPlayerAchievementRow[] = achievements.map((a) => ({
    achievementId: a.achievementId,
    status: a.status,
    claimed: a.claimed,
    unlockedAt: a.unlockedAt,
  }));

  const scoreRows: AdminPlayerScoreRow[] = scores.rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => ({
      gameId: r.raw.game_id ?? '',
      playedAt: r.raw.played_at ?? '',
      score: Number(r.raw.score ?? '0') || 0,
      result: r.raw.result ?? '',
      personalBest: r.values.personal_best === true,
    }));

  const messageRows: AdminPlayerMessageRow[] = messages.rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => ({
      messageId: r.raw.message_id ?? '',
      deliveryStatus: r.raw.delivery_status ?? '',
      readStatus: r.raw.read_status ?? '',
      deliveredAt: r.raw.delivered_at ?? '',
    }));

  return {
    ok: true,
    userId,
    character,
    progress: progressRows,
    keys: keyRows,
    achievements: achievementRows,
    scores: scoreRows,
    messages: messageRows,
    worldDocs: worldDocs as unknown as Record<string, unknown>,
  };
}
