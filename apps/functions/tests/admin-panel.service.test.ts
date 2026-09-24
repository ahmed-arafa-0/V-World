import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK, row } from '@veoullas-world/test-fixtures';
import {
  getAdminDashboard,
  inspectPlayer,
  queryAdminLogs,
} from '../src/services/admin-panel.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]> = GOOD_WORKBOOK): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

const NOW = new Date('2026-01-01T12:00:00.000Z'); // inside the fixture session's validity window

describe('getAdminDashboard', () => {
  it('summarizes authoritative time, schema health, active sessions, and recent logs', async () => {
    const gateway = gatewayFor();
    const dashboard = await getAdminDashboard(gateway, NOW);

    expect(dashboard.ok).toBe(true);
    expect(dashboard.serverTime).toBe(NOW.toISOString());
    expect(dashboard.schemaHealth.expectedTabCount).toBeGreaterThan(0);
    expect(dashboard.activeSessionCount).toBe(1);
    expect(dashboard.lastLogs.some((l) => l.logId === 'log_fixture_1')).toBe(true);
    // Never leaks a raw log_id/user_id mismatch — the fixture row's IP passes through untouched
    // (Admin is the one surface authorized to see it, unlike every player-facing response).
    expect(dashboard.lastLogs.find((l) => l.logId === 'log_fixture_1')?.ip).toBe('203.0.113.10');
  });

  it('does not count an expired session as active', async () => {
    const wb = structuredClone(GOOD_WORKBOOK) as Record<string, string[][]>;
    const expired = row('06_SESSIONS', {
      session_id: 'sess_expired',
      user_id: 'veoulla',
      created_at: '2025-01-01T00:00:00.000Z',
      last_seen_at: '2025-01-01T00:05:00.000Z',
      expires_at: '2025-01-02T00:00:00.000Z',
      ip_address: '203.0.113.20',
      status: 'active',
    });
    wb['06_SESSIONS'] = [...wb['06_SESSIONS']!, expired];
    const gateway = gatewayFor(wb);
    const dashboard = await getAdminDashboard(gateway, NOW);
    expect(dashboard.activeSessionCount).toBe(1); // only the still-valid fixture session
  });
});

describe('queryAdminLogs', () => {
  function withExtraLogs(): Record<string, string[][]> {
    const wb = structuredClone(GOOD_WORKBOOK) as Record<string, string[][]>;
    wb['05_ENTRY_LOGS'] = [
      ...wb['05_ENTRY_LOGS']!,
      row('05_ENTRY_LOGS', {
        log_id: 'log_gate_fail',
        timestamp: '2026-01-02T00:00:00.000Z',
        user_id: '',
        session_id: '',
        event_type: 'gate_failure',
        access_result: 'rejected',
        ip_address: '203.0.113.99',
        device_id: '',
        language: 'en',
        route: '/',
        details_json: '{}',
      }),
      row('05_ENTRY_LOGS', {
        log_id: 'log_admin_ok',
        timestamp: '2026-01-03T00:00:00.000Z',
        user_id: 'admin_ahmed',
        session_id: '',
        event_type: 'admin_success',
        access_result: 'ok',
        ip_address: '203.0.113.10',
        device_id: '',
        language: 'en',
        route: '/',
        details_json: '{}',
      }),
    ];
    return wb;
  }

  it('filters by event type', async () => {
    const gateway = gatewayFor(withExtraLogs());
    const result = await queryAdminLogs(gateway, { eventType: 'gate_failure' });
    expect(result.total).toBe(1);
    expect(result.rows[0]!.logId).toBe('log_gate_fail');
  });

  it('filters by IP', async () => {
    const gateway = gatewayFor(withExtraLogs());
    const result = await queryAdminLogs(gateway, { ip: '203.0.113.99' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.ip).toBe('203.0.113.99');
  });

  it('filters by date range', async () => {
    const gateway = gatewayFor(withExtraLogs());
    const result = await queryAdminLogs(gateway, {
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-02T23:59:59.000Z',
    });
    expect(result.rows.map((r) => r.logId)).toEqual(['log_gate_fail']);
  });

  it('sorts newest first and paginates within a bounded limit', async () => {
    const gateway = gatewayFor(withExtraLogs());
    const result = await queryAdminLogs(gateway, { limit: 1, offset: 0 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.logId).toBe('log_admin_ok'); // latest timestamp
    expect(result.total).toBe(3);
  });
});

describe('inspectPlayer', () => {
  it('aggregates character, progress, keys, achievements, scores, and messages for one user, never another', async () => {
    const gateway = gatewayFor();
    const view = await inspectPlayer(gateway, 'veoulla');

    expect(view.userId).toBe('veoulla');
    expect(view.keys.length).toBeGreaterThan(0);
    expect(view.scores.some((s) => s.gameId === 'game_memory_1')).toBe(true);
    expect(view.messages.some((m) => m.messageId === 'msg_first')).toBe(true);
    expect(view.worldDocs).toBeDefined();

    const other = await inspectPlayer(gateway, 'someone_else_entirely');
    expect(other.scores).toHaveLength(0);
    expect(other.messages).toHaveLength(0);
    expect(other.keys).toHaveLength(0);
  });
});
