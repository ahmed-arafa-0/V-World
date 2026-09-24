import type { SchemaHealthSummary } from './schema-health.js';

/**
 * Admin-only operational contracts (M17). Every shape here is for the authenticated Admin
 * operator (Ahmed), never the player-facing browser — these responses may carry IP addresses
 * and raw internal ids that the player-facing contracts in `world.ts` deliberately never expose.
 */

export interface AdminLogRow {
  logId: string;
  timestamp: string;
  userId: string;
  sessionId: string;
  eventType: string;
  accessResult: string;
  ip: string;
  userAgent: string;
  deviceId: string;
  language: string;
  route: string;
}

export interface AdminDashboardResponse {
  ok: true;
  serverTime: string;
  timeZone: string;
  schemaHealth: SchemaHealthSummary;
  activeSessionCount: number;
  lastLogs: AdminLogRow[];
  /** How long ago (ms) this process last actually fetched each tab from Google; absent = never this process. */
  cacheAgeMs: Record<string, number>;
}

export interface AdminLogQuery {
  from?: string;
  to?: string;
  eventType?: string;
  accessResult?: string;
  ip?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface AdminLogsResponse {
  ok: true;
  rows: AdminLogRow[];
  total: number;
}

export interface AdminPlayerCharacter {
  personalName: string;
  selectedGender: string;
  currentLocation: string;
  updatedAt: string;
}

export interface AdminPlayerProgressRow {
  routeId: string;
  status: string;
  currentBeatId: string;
  currentLocation: string;
  startedAt: string;
  completedAt: string;
}

export interface AdminPlayerKeyRow {
  keyTypeId: string;
  quantityFound: number;
  quantitySpent: number;
  quantityAvailable: number;
}

export interface AdminPlayerAchievementRow {
  achievementId: string;
  status: string;
  claimed: boolean;
  unlockedAt: string;
}

export interface AdminPlayerScoreRow {
  gameId: string;
  playedAt: string;
  score: number;
  result: string;
  personalBest: boolean;
}

export interface AdminPlayerMessageRow {
  messageId: string;
  deliveryStatus: string;
  readStatus: string;
  deliveredAt: string;
}

export interface AdminPlayerInspectResponse {
  ok: true;
  userId: string;
  character: AdminPlayerCharacter | null;
  progress: AdminPlayerProgressRow[];
  keys: AdminPlayerKeyRow[];
  achievements: AdminPlayerAchievementRow[];
  scores: AdminPlayerScoreRow[];
  messages: AdminPlayerMessageRow[];
  /** Raw per-location-system JSON documents (`37_CHARACTER_STATE`), for diagnostics only. */
  worldDocs: Record<string, unknown>;
}
