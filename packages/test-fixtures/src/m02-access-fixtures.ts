import { GOOD_WORKBOOK, type RawWorkbook } from './good-workbook.js';
import { headerFor, row } from './row-builder.js';

/**
 * Network-free fake M02 access/session data. Every value here is a
 * fixture-only placeholder — never Ahmed's real Gate code or Admin
 * password, which live only in the real private Sheet.
 */

export const M02_FAKE_GATE_CODE = '4821';
export const M02_FAKE_ADMIN_PASSWORD = 'fixture-admin-secret-only';

export const M02_OWNER_USER_ID = 'owner_fixture';
export const M02_ADMIN_USER_ID = 'admin_fixture';

/** Active owner (Gate) and active Admin rows, as two distinct 02_USERS rows — matches the real Sheet's shape. */
export const M02_USERS_ROWS: string[][] = [
  headerFor('02_USERS'),
  row('02_USERS', {
    user_id: M02_OWNER_USER_ID,
    display_name: 'Fixture Owner',
    role: 'owner',
    gate_code_plaintext: M02_FAKE_GATE_CODE,
    admin_password_plaintext: '',
    active: 'TRUE',
    default_language: 'en',
    notes: 'fixture',
  }),
  row('02_USERS', {
    user_id: M02_ADMIN_USER_ID,
    display_name: 'Fixture Admin',
    role: 'admin',
    gate_code_plaintext: '',
    admin_password_plaintext: M02_FAKE_ADMIN_PASSWORD,
    active: 'TRUE',
    default_language: 'en',
    notes: 'fixture',
  }),
];

export const M02_SESSION_ACTIVE_ID = 'sess_m02_active';
export const M02_SESSION_EXPIRED_ID = 'sess_m02_expired';
export const M02_SESSION_TERMINATED_ID = 'sess_m02_terminated';

/** One active, one expired, and one terminated session, covering the three 06_SESSIONS statuses. */
export const M02_SESSIONS_ROWS: string[][] = [
  headerFor('06_SESSIONS'),
  row('06_SESSIONS', {
    session_id: M02_SESSION_ACTIVE_ID,
    user_id: M02_OWNER_USER_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:05:00.000Z',
    expires_at: '2026-01-02T00:00:00.000Z',
    ip_address: '203.0.113.20',
    device_id: 'device_m02_1',
    status: 'active',
    gate_code_id: '',
    current_location: 'gate',
    current_story_beat: 'beat_01',
  }),
  row('06_SESSIONS', {
    session_id: M02_SESSION_EXPIRED_ID,
    user_id: M02_OWNER_USER_ID,
    created_at: '2025-12-01T00:00:00.000Z',
    last_seen_at: '2025-12-01T00:10:00.000Z',
    expires_at: '2025-12-02T00:00:00.000Z',
    ip_address: '203.0.113.21',
    device_id: 'device_m02_2',
    status: 'expired',
    gate_code_id: '',
    current_location: 'gate',
    current_story_beat: 'beat_01',
  }),
  row('06_SESSIONS', {
    session_id: M02_SESSION_TERMINATED_ID,
    user_id: M02_ADMIN_USER_ID,
    created_at: '2026-01-05T00:00:00.000Z',
    last_seen_at: '2026-01-05T00:30:00.000Z',
    expires_at: '2026-01-05T02:00:00.000Z',
    ip_address: '203.0.113.22',
    device_id: 'device_m02_3',
    status: 'terminated',
    gate_code_id: '',
    current_location: 'gate',
    current_story_beat: 'beat_01',
  }),
];

/**
 * Gate/Admin success and failure logs, plus a rate-limit sequence: five
 * consecutive gate_failure attempts from the same session/device followed
 * by one gate_rate_limited log — matching the accepted
 * gate_max_attempts=5 configuration.
 */
export const M02_ENTRY_LOGS_ROWS: string[][] = [
  headerFor('05_ENTRY_LOGS'),
  row('05_ENTRY_LOGS', {
    log_id: 'log_m02_gate_success',
    timestamp: '2026-01-01T00:00:00.000Z',
    user_id: M02_OWNER_USER_ID,
    session_id: M02_SESSION_ACTIVE_ID,
    event_type: 'gate_success',
    access_result: 'success',
    ip_address: '203.0.113.20',
    user_agent: 'fixture-agent',
    device_id: 'device_m02_1',
    language: 'en',
    route: '/',
    details_json: '{}',
  }),
  row('05_ENTRY_LOGS', {
    log_id: 'log_m02_gate_failure',
    timestamp: '2026-01-01T00:01:00.000Z',
    user_id: '',
    session_id: '',
    event_type: 'gate_failure',
    access_result: 'failure',
    ip_address: '203.0.113.30',
    user_agent: 'fixture-agent',
    device_id: 'device_m02_4',
    language: 'en',
    route: '/',
    details_json: '{}',
  }),
  row('05_ENTRY_LOGS', {
    log_id: 'log_m02_admin_success',
    timestamp: '2026-01-05T00:00:00.000Z',
    user_id: M02_ADMIN_USER_ID,
    session_id: M02_SESSION_TERMINATED_ID,
    event_type: 'admin_success',
    access_result: 'success',
    ip_address: '203.0.113.22',
    user_agent: 'fixture-agent',
    device_id: 'device_m02_3',
    language: 'en',
    route: '/admin',
    details_json: '{}',
  }),
  row('05_ENTRY_LOGS', {
    log_id: 'log_m02_admin_failure',
    timestamp: '2026-01-05T00:00:30.000Z',
    user_id: '',
    session_id: '',
    event_type: 'admin_failure',
    access_result: 'failure',
    ip_address: '203.0.113.40',
    user_agent: 'fixture-agent',
    device_id: 'device_m02_5',
    language: 'en',
    route: '/admin',
    details_json: '{}',
  }),
  ...[1, 2, 3, 4, 5].map((n) =>
    row('05_ENTRY_LOGS', {
      log_id: `log_m02_rate_limit_attempt_${n}`,
      timestamp: `2026-01-06T00:0${n}:00.000Z`,
      user_id: '',
      session_id: '',
      event_type: 'gate_failure',
      access_result: 'failure',
      ip_address: '203.0.113.50',
      user_agent: 'fixture-agent',
      device_id: 'device_m02_ratelimit',
      language: 'en',
      route: '/',
      details_json: `{"attempt":${n}}`,
    }),
  ),
  row('05_ENTRY_LOGS', {
    log_id: 'log_m02_rate_limited',
    timestamp: '2026-01-06T00:06:00.000Z',
    user_id: '',
    session_id: '',
    event_type: 'gate_rate_limited',
    access_result: 'rate_limited',
    ip_address: '203.0.113.50',
    user_agent: 'fixture-agent',
    device_id: 'device_m02_ratelimit',
    language: 'en',
    route: '/',
    details_json: '{"cooldownSeconds":10}',
  }),
];

/** The exact accepted M02 01_APP_CONFIG rows (mirrors scripts/seed-m02-access-config.mjs). */
export const M02_APP_CONFIG_ROWS: string[][] = [
  headerFor('01_APP_CONFIG'),
  row('01_APP_CONFIG', {
    config_key: 'owner_session_duration_minutes',
    value: '1440',
    value_type: 'integer',
    description: 'Owner (Veoulla) Gate session absolute expiry, in minutes.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'admin_session_duration_minutes',
    value: '120',
    value_type: 'integer',
    description: 'Admin session absolute expiry, in minutes.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'gate_max_attempts',
    value: '5',
    value_type: 'integer',
    description: 'Consecutive failed Gate attempts allowed before the cooldown engages.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'gate_cooldown_seconds',
    value: '10',
    value_type: 'integer',
    description: 'Cooldown duration, in seconds, after gate_max_attempts consecutive failures.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'admin_max_attempts',
    value: '3',
    value_type: 'integer',
    description: 'Consecutive failed Admin login attempts allowed before the cooldown engages.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'admin_cooldown_seconds',
    value: '30',
    value_type: 'integer',
    description: 'Cooldown duration, in seconds, after admin_max_attempts consecutive failures.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
  row('01_APP_CONFIG', {
    config_key: 'session_heartbeat_seconds',
    value: '30',
    value_type: 'integer',
    description:
      'Expected client heartbeat interval, in seconds. Heartbeat keeps a session marked active but never extends its absolute expiry.',
    enabled: 'TRUE',
    restart_required: 'FALSE',
  }),
];

/** The parsed shape `loadAccessConfig` must return for M02_APP_CONFIG_ROWS above. */
export const M02_ACCEPTED_ACCESS_CONFIG = {
  ownerSessionDurationMinutes: 1440,
  adminSessionDurationMinutes: 120,
  gateMaxAttempts: 5,
  gateCooldownSeconds: 10,
  adminMaxAttempts: 3,
  adminCooldownSeconds: 30,
  sessionHeartbeatSeconds: 30,
} as const;

/** The eleven accepted `entry_event_type` values (mirrors scripts/seed-m02-access-config.mjs). */
export const M02_ENTRY_EVENT_TYPES: string[] = [
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

export const M02_VALIDATION_LISTS_ROWS: string[][] = [
  ['list_name', 'value', 'sort_order', 'enabled', 'notes'],
  ...M02_ENTRY_EVENT_TYPES.map((value, i) => [
    'entry_event_type',
    value,
    String(i + 1),
    'TRUE',
    '',
  ]),
];

/**
 * GOOD_WORKBOOK with M02 access/session fixture data layered in: 02_USERS,
 * 05_ENTRY_LOGS, and 06_SESSIONS are replaced by the M02 fixture rows above
 * (the accepted owner/Admin/session/log shapes for M02 tests), while
 * 01_APP_CONFIG and 39_VALIDATION_LISTS keep every GOOD_WORKBOOK row and
 * gain the M02 access-config / entry_event_type rows appended. Intended for
 * targeted M02 service tests (access-config loading, seed idempotency) —
 * not a substitute for GOOD_WORKBOOK in full schema-health tests, since
 * replacing 02_USERS drops the "veoulla" id some M01 relationship checks
 * (e.g. 19_MESSAGES.recipient_user_id) expect.
 */
export function buildM02Workbook(): RawWorkbook {
  const workbook = structuredClone(GOOD_WORKBOOK);

  workbook['02_USERS'] = structuredClone(M02_USERS_ROWS);
  workbook['05_ENTRY_LOGS'] = structuredClone(M02_ENTRY_LOGS_ROWS);
  workbook['06_SESSIONS'] = structuredClone(M02_SESSIONS_ROWS);

  workbook['01_APP_CONFIG'] = [
    ...workbook['01_APP_CONFIG'],
    ...structuredClone(M02_APP_CONFIG_ROWS.slice(1)),
  ];
  workbook['39_VALIDATION_LISTS'] = [
    ...workbook['39_VALIDATION_LISTS'],
    ...structuredClone(M02_VALIDATION_LISTS_ROWS.slice(1)),
  ];

  return workbook;
}
