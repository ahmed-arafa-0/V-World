import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildM02Workbook, M02_FAKE_GATE_CODE } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import { FlakyGoogleSheetsClient } from './helpers/flaky-sheets-client.js';

const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

function makeFlakyApp() {
  const inner = new FakeGoogleSheetsClient(structuredClone(buildM02Workbook()));
  const flaky = new FlakyGoogleSheetsClient(inner);
  const gateway = new SheetGateway(flaky, { ttlSeconds: 60 });
  const app = createApp({
    getGateway: () => gateway,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    isProduction: () => false,
  });
  return { app, gateway, flaky };
}

describe('Sheet outage safety', () => {
  it('returns a safe 500/503 result (never a raw Google error) when the Sheet read fails', async () => {
    const { app, flaky } = makeFlakyApp();
    flaky.failNextCalls('getValues', 1);

    const res = await request(app)
      .post('/api/auth/gate')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_outage', attemptId: 'outage1' });

    expect([500, 503]).toContain(res.status);
    expect(res.body.ok).toBe(false);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/gserviceaccount|private_key|stack|Error:/i);
  });
});

describe('Partial-write reconciliation', () => {
  it('retrying a Gate login after the session was created but the success log append failed reconciles safely (no duplicate session, log eventually written)', async () => {
    const { app, gateway, flaky } = makeFlakyApp();

    // Let the FIRST appendValues call (session creation) succeed, then fail
    // the SECOND (the success-log append) exactly once.
    flaky.failAfterCalls('appendValues', 1, 1);

    const body = { digits: CORRECT_DIGITS, deviceId: 'device_recon', attemptId: 'recon1' };
    const first = await request(app).post('/api/auth/gate').send(body);
    expect(first.status).toBeGreaterThanOrEqual(500);

    // The session row was already created by the first (failed) attempt.
    const sessionsAfterFirst = await gateway.getRawTab('06_SESSIONS', { bypass: true });
    const [sHeader, ...sRows] = sessionsAfterFirst;
    const idIdx = sHeader!.indexOf('session_id');
    expect(sRows.filter((r) => r[idIdx] === 'sess_gate_recon1')).toHaveLength(1);

    // A retry with the SAME attemptId completes cleanly: reuses the
    // existing session (does not duplicate it) and successfully appends
    // the success log this time.
    const second = await request(app).post('/api/auth/gate').send(body);
    expect(second.status).toBe(200);
    expect(second.body.session).toMatchObject({ kind: 'owner', userId: 'owner_fixture' });

    const sessionsAfterSecond = await gateway.getRawTab('06_SESSIONS', { bypass: true });
    const [sHeader2, ...sRows2] = sessionsAfterSecond;
    const idIdx2 = sHeader2!.indexOf('session_id');
    expect(sRows2.filter((r) => r[idIdx2] === 'sess_gate_recon1')).toHaveLength(1);

    const logs = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const [lHeader, ...lRows] = logs;
    const logIdIdx = lHeader!.indexOf('log_id');
    expect(lRows.filter((r) => r[logIdIdx] === 'log_gate_success_recon1')).toHaveLength(1);
  });

  it('repeated attemptIds never duplicate a session or a success log across 3 identical retries', async () => {
    const { app, gateway } = makeFlakyApp();
    const body = { digits: CORRECT_DIGITS, deviceId: 'device_recon2', attemptId: 'recon2' };

    await request(app).post('/api/auth/gate').send(body);
    await request(app).post('/api/auth/gate').send(body);
    await request(app).post('/api/auth/gate').send(body);

    const sessions = await gateway.getRawTab('06_SESSIONS', { bypass: true });
    const [sHeader, ...sRows] = sessions;
    const idIdx = sHeader!.indexOf('session_id');
    expect(sRows.filter((r) => r[idIdx] === 'sess_gate_recon2')).toHaveLength(1);

    const logs = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const [lHeader, ...lRows] = logs;
    const logIdIdx = lHeader!.indexOf('log_id');
    expect(lRows.filter((r) => r[logIdIdx] === 'log_gate_success_recon2')).toHaveLength(1);
  });
});
