import { describe, expect, it } from 'vitest';
import { buildM02Workbook } from '@veoullas-world/test-fixtures';
import { resolveActiveSession } from '../src/services/session-resolution.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

function addSessionRow(
  workbook: Record<string, string[][]>,
  sessionId: string,
  overrides: Partial<{
    userId: string;
    status: string;
    expiresAt: string;
    ipAddress: string;
    deviceId: string;
  }> = {},
): void {
  const header = workbook['06_SESSIONS']![0]!;
  const row = header.map((col) => {
    switch (col) {
      case 'session_id':
        return sessionId;
      case 'user_id':
        return overrides.userId ?? 'owner_fixture';
      case 'created_at':
        return '2026-01-01T00:00:00.000Z';
      case 'last_seen_at':
        return '2026-01-01T00:00:00.000Z';
      case 'expires_at':
        return overrides.expiresAt ?? '2026-01-02T00:00:00.000Z';
      case 'ip_address':
        return overrides.ipAddress ?? '203.0.113.9';
      case 'device_id':
        return overrides.deviceId ?? 'device_test';
      case 'status':
        return overrides.status ?? 'active';
      default:
        return '';
    }
  });
  workbook['06_SESSIONS'] = [...workbook['06_SESSIONS']!, row];
}

const NOW = new Date('2026-01-01T12:00:00.000Z');

describe('resolveActiveSession', () => {
  it('returns SESSION_REQUIRED when no cookie value is supplied', async () => {
    const gateway = gatewayFor(buildM02Workbook());
    const result = await resolveActiveSession(gateway, 'owner', undefined, NOW);
    expect(result).toEqual({ ok: false, code: 'SESSION_REQUIRED' });
  });

  it('returns SESSION_INVALID for an unknown session ID', async () => {
    const gateway = gatewayFor(buildM02Workbook());
    const result = await resolveActiveSession(gateway, 'owner', 'sess_gate_does_not_exist', NOW);
    expect(result).toEqual({ ok: false, code: 'SESSION_INVALID' });
  });

  it('returns ok:true for a valid active owner session', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_abc', { expiresAt: '2026-01-02T00:00:00.000Z' });
    const gateway = gatewayFor(workbook);

    const result = await resolveActiveSession(gateway, 'owner', 'sess_gate_abc', NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessionId).toBe('sess_gate_abc');
      expect(result.row.status).toBe('active');
    }
  });

  it('returns SESSION_TERMINATED for a terminated session and logs session_terminated exactly once', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_term', { status: 'terminated' });
    const gateway = gatewayFor(workbook);

    const first = await resolveActiveSession(gateway, 'owner', 'sess_gate_term', NOW);
    expect(first).toEqual({ ok: false, code: 'SESSION_TERMINATED' });

    const second = await resolveActiveSession(gateway, 'owner', 'sess_gate_term', NOW);
    expect(second).toEqual({ ok: false, code: 'SESSION_TERMINATED' });

    const logs = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const header = logs[0]!;
    const idIdx = header.indexOf('log_id');
    const matches = logs
      .slice(1)
      .filter((r) => r[idIdx] === 'log_session_terminated_sess_gate_term');
    expect(matches).toHaveLength(1);
  });

  it('transitions to expired, updates the Sheet row, and logs session_expired exactly once when now is past expires_at', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_exp', { expiresAt: '2026-01-01T00:00:00.000Z' }); // in the past relative to NOW
    const gateway = gatewayFor(workbook);

    const first = await resolveActiveSession(gateway, 'owner', 'sess_gate_exp', NOW);
    expect(first).toEqual({ ok: false, code: 'SESSION_EXPIRED' });

    const afterFirst = await gateway.findByPrimaryKey('06_SESSIONS', 'sess_gate_exp', {
      bypass: true,
    });
    expect(afterFirst?.row.raw.status).toBe('expired');

    const second = await resolveActiveSession(gateway, 'owner', 'sess_gate_exp', NOW);
    expect(second).toEqual({ ok: false, code: 'SESSION_EXPIRED' });

    const logs = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const header = logs[0]!;
    const idIdx = header.indexOf('log_id');
    const matches = logs.slice(1).filter((r) => r[idIdx] === 'log_session_expired_sess_gate_exp');
    expect(matches).toHaveLength(1);
  });

  it('never extends expires_at when transitioning an expired session', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_exp2', { expiresAt: '2026-01-01T00:00:00.000Z' });
    const gateway = gatewayFor(workbook);

    await resolveActiveSession(gateway, 'owner', 'sess_gate_exp2', NOW);

    const after = await gateway.findByPrimaryKey('06_SESSIONS', 'sess_gate_exp2', { bypass: true });
    expect(after?.row.raw.expires_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns SESSION_FORBIDDEN when a valid session of one kind is presented as the other kind', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_owner1', { expiresAt: '2026-01-02T00:00:00.000Z' });
    const gateway = gatewayFor(workbook);

    // Same session ID, but the caller is asking to resolve it as an admin session.
    const result = await resolveActiveSession(gateway, 'admin', 'sess_gate_owner1', NOW);
    expect(result).toEqual({ ok: false, code: 'SESSION_FORBIDDEN' });
  });

  it('a terminated session takes precedence over an also-expired one', async () => {
    const workbook = buildM02Workbook();
    addSessionRow(workbook, 'sess_gate_both', {
      status: 'terminated',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const gateway = gatewayFor(workbook);

    const result = await resolveActiveSession(gateway, 'owner', 'sess_gate_both', NOW);
    expect(result).toEqual({ ok: false, code: 'SESSION_TERMINATED' });
  });
});
