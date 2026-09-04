import type { BackendConfigStatus } from './config-status.js';
import type { SchemaHealthStatus } from './schema-health.js';

/** Milestone identifier string, e.g. "M01". Grows as milestones are accepted. */
export type MilestoneId = string;

export type BackendEnvironment = 'local' | 'emulator' | 'staging' | 'production';

export interface HealthSheetsStatus {
  reachable: boolean;
}

export interface HealthSchemaStatus {
  status: SchemaHealthStatus;
  errorCount: number;
  warningCount: number;
}

export interface HealthCacheStatus {
  entryCount: number;
  ttlSeconds: number;
}

/**
 * Shape returned by GET /api/health.
 * `timestamp` must always be generated server-side, never by the client.
 * Never includes the service-account email, credential file path, or any
 * Sheet/Drive identifier.
 */
export interface HealthResponse {
  ok: true;
  service: 'veoullas-world-functions';
  environment: BackendEnvironment;
  timestamp: string;
  milestone: MilestoneId;
  config: BackendConfigStatus;
  sheets: HealthSheetsStatus;
  schemaHealth: HealthSchemaStatus;
  cache: HealthCacheStatus;
}
