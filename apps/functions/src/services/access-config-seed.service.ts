import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * The seven accepted M02 access-configuration rows for 01_APP_CONFIG. Single
 * source of truth shared by the live seed script and its tests — never
 * duplicate these values elsewhere.
 */
export interface AccessConfigSeedRowSpec {
  config_key: string;
  value: string;
  value_type: string;
  description: string;
}

export const ACCESS_CONFIG_SEED_ROWS: AccessConfigSeedRowSpec[] = [
  {
    config_key: 'owner_session_duration_minutes',
    value: '1440',
    value_type: 'integer',
    description: 'Owner (Veoulla) Gate session absolute expiry, in minutes.',
  },
  {
    config_key: 'admin_session_duration_minutes',
    value: '120',
    value_type: 'integer',
    description: 'Admin session absolute expiry, in minutes.',
  },
  {
    config_key: 'gate_max_attempts',
    value: '5',
    value_type: 'integer',
    description: 'Consecutive failed Gate attempts allowed before the cooldown engages.',
  },
  {
    config_key: 'gate_cooldown_seconds',
    value: '10',
    value_type: 'integer',
    description: 'Cooldown duration, in seconds, after gate_max_attempts consecutive failures.',
  },
  {
    config_key: 'admin_max_attempts',
    value: '3',
    value_type: 'integer',
    description: 'Consecutive failed Admin login attempts allowed before the cooldown engages.',
  },
  {
    config_key: 'admin_cooldown_seconds',
    value: '30',
    value_type: 'integer',
    description: 'Cooldown duration, in seconds, after admin_max_attempts consecutive failures.',
  },
  {
    config_key: 'session_heartbeat_seconds',
    value: '30',
    value_type: 'integer',
    description:
      'Expected client heartbeat interval, in seconds. Heartbeat keeps a session marked active but never extends its absolute expiry.',
  },
];

/** The eleven accepted `entry_event_type` values for 39_VALIDATION_LISTS. */
export const ENTRY_EVENT_TYPE_VALUES: string[] = [
  'page_open',
  'gate_failure',
  'gate_success',
  'gate_rate_limited',
  'admin_failure',
  'admin_success',
  'admin_rate_limited',
  'session_resume',
  'session_end',
  'session_expired',
  'session_terminated',
];

export interface SeedOutcome {
  created: string[];
  updated: string[];
  unchanged: string[];
}

function emptyOutcome(): SeedOutcome {
  return { created: [], updated: [], unchanged: [] };
}

/**
 * Idempotently upserts the accepted M02 access-configuration rows into
 * 01_APP_CONFIG, keyed by the stable `config_key` primary key. Rerunning
 * this never creates a duplicate row and never touches any other
 * 01_APP_CONFIG row (in particular, never the Gate code or Admin password —
 * those live in 02_USERS, which this function never reads or writes).
 */
export async function seedAccessAppConfig(gateway: SheetGateway): Promise<SeedOutcome> {
  const outcome = emptyOutcome();

  for (const spec of ACCESS_CONFIG_SEED_ROWS) {
    const existing = await gateway.findByPrimaryKey('01_APP_CONFIG', spec.config_key, {
      bypass: true,
    });

    const desiredPatch: Record<string, string> = {
      value: spec.value,
      value_type: spec.value_type,
      description: spec.description,
      enabled: 'TRUE',
      restart_required: 'FALSE',
    };

    if (!existing) {
      await gateway.appendRow('01_APP_CONFIG', { config_key: spec.config_key, ...desiredPatch });
      outcome.created.push(spec.config_key);
      continue;
    }

    const changedPatch: Record<string, string> = {};
    for (const [column, value] of Object.entries(desiredPatch)) {
      if ((existing.row.raw[column] ?? '') !== value) {
        changedPatch[column] = value;
      }
    }

    if (Object.keys(changedPatch).length === 0) {
      outcome.unchanged.push(spec.config_key);
      continue;
    }

    await gateway.updateByPrimaryKey('01_APP_CONFIG', spec.config_key, changedPatch);
    outcome.updated.push(spec.config_key);
  }

  return outcome;
}

/**
 * Idempotently adds the accepted `entry_event_type` values to
 * 39_VALIDATION_LISTS. That tab has no literal primary key column (its key
 * is the derived `list_name|value` pair), so each value is existence-checked
 * before appending rather than relying on the gateway's built-in
 * duplicate-primary-key append guard.
 */
export async function seedEntryEventTypeValidationList(
  gateway: SheetGateway,
): Promise<SeedOutcome> {
  const outcome = emptyOutcome();

  for (let i = 0; i < ENTRY_EVENT_TYPE_VALUES.length; i++) {
    const value = ENTRY_EVENT_TYPE_VALUES[i]!;
    const derivedKey = `entry_event_type|${value}`;
    const existing = await gateway.findByPrimaryKey('39_VALIDATION_LISTS', derivedKey, {
      bypass: true,
    });

    if (existing) {
      outcome.unchanged.push(value);
      continue;
    }

    await gateway.appendRow('39_VALIDATION_LISTS', {
      list_name: 'entry_event_type',
      value,
      sort_order: String(i + 1),
      enabled: 'TRUE',
      notes: '',
    });
    outcome.created.push(value);
  }

  return outcome;
}
