import { AppError } from '../errors/app-error.js';
import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Backend-only, typed view of the M02 access-configuration rows in
 * 01_APP_CONFIG. Never exposes the Gate code or Admin password — those live
 * in 02_USERS and are outside this configuration surface entirely. Login is
 * not implemented here; this is the foundation a later M02 part builds on.
 */
export interface AccessConfig {
  ownerSessionDurationMinutes: number;
  adminSessionDurationMinutes: number;
  gateMaxAttempts: number;
  gateCooldownSeconds: number;
  adminMaxAttempts: number;
  adminCooldownSeconds: number;
  sessionHeartbeatSeconds: number;
}

const ACCESS_CONFIG_KEYS = [
  ['owner_session_duration_minutes', 'ownerSessionDurationMinutes'],
  ['admin_session_duration_minutes', 'adminSessionDurationMinutes'],
  ['gate_max_attempts', 'gateMaxAttempts'],
  ['gate_cooldown_seconds', 'gateCooldownSeconds'],
  ['admin_max_attempts', 'adminMaxAttempts'],
  ['admin_cooldown_seconds', 'adminCooldownSeconds'],
  ['session_heartbeat_seconds', 'sessionHeartbeatSeconds'],
] as const satisfies ReadonlyArray<readonly [string, keyof AccessConfig]>;

function parsePositiveInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Loads and validates the seven accepted M02 access-configuration values.
 * Throws `ACCESS_CONFIG_INVALID` for any key that is missing, not enabled,
 * duplicated, or not a positive integer — never guesses a default for
 * security-relevant configuration.
 */
export async function loadAccessConfig(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<AccessConfig> {
  const result = await gateway.readTab('01_APP_CONFIG', options);
  const out = {} as AccessConfig;

  for (const [sheetKey, fieldName] of ACCESS_CONFIG_KEYS) {
    if (result.duplicatePrimaryKeyValues.includes(sheetKey)) {
      throw new AppError(
        'ACCESS_CONFIG_INVALID',
        `Access configuration key "${sheetKey}" is duplicated in 01_APP_CONFIG.`,
      );
    }

    const match = result.rows.find(
      (r) => r.primaryKeyValue === sheetKey && r.values.enabled === true,
    );

    if (!match) {
      throw new AppError(
        'ACCESS_CONFIG_INVALID',
        `Access configuration key "${sheetKey}" is missing or not enabled in 01_APP_CONFIG.`,
      );
    }

    const parsed = parsePositiveInteger(String(match.raw.value ?? ''));
    if (parsed === null) {
      throw new AppError(
        'ACCESS_CONFIG_INVALID',
        `Access configuration key "${sheetKey}" must be a positive integer.`,
      );
    }

    out[fieldName] = parsed;
  }

  return out;
}
