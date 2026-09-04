import type { BackendConfigStatus } from './config-status.js';

/** Milestone identifier string, e.g. "M00". Grows as milestones are accepted. */
export type MilestoneId = string;

export type BackendEnvironment = 'local' | 'emulator' | 'staging' | 'production';

/**
 * Shape returned by GET /api/health.
 * `timestamp` must always be generated server-side, never by the client.
 */
export interface HealthResponse {
  ok: true;
  service: 'veoullas-world-functions';
  environment: BackendEnvironment;
  timestamp: string;
  milestone: MilestoneId;
  config: BackendConfigStatus;
}
