import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  buildM02Workbook,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const CORRECT_DIGITS = M02_FAKE_GATE_CODE.split('');

function makeApp(workbook = buildM02Workbook(), nowIso = '2026-01-01T00:00:00.000Z') {
  const client = new FakeGoogleSheetsClient(structuredClone(workbook));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  let current = new Date(nowIso);
  const app = createApp({
    getGateway: () => gateway,
    now: () => current,
    isProduction: () => false,
  });
  return {
    app,
    gateway,
    setNow: (iso: string) => {
      current = new Date(iso);
    },
    advanceSeconds: (seconds: number) => {
      current = new Date(current.getTime() + seconds * 1000);
    },
  };
}

async function readEntryLogs(gateway: SheetGateway) {
  const raw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
  const [header, ...rows] = raw;
  return rows.map((r) => Object.fromEntries(header!.map((c, i) => [c, r[i]])));
}

describe('POST /api/access/page-open', () => {
  it('logs a page_open event and returns ok with a logId', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/access/page-open')
      .send({ operationId: 'op_1', language: 'en', route: '/', deviceId: 'device_1' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.logId).toBe('string');
  });

  it('creates exactly one log row when the same operationId is retried', async () => {
    const { app, gateway } = makeApp();
    await request(app).post('/api/access/page-open').send({ operationId: 'op_dup' });
    const res2 = await request(app).post('/api/access/page-open').send({ operationId: 'op_dup' });

    expect(res2.status).toBe(200);
    const logs = await readEntryLogs(gateway);
    const matches = logs.filter((r) => r.log_id === 'log_pageopen_op_dup');
    expect(matches).toHaveLength(1);
  });

  it('rejects a request missing operationId', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/access/page-open').send({ language: 'en' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('ignores a client-supplied ip/ip_address field entirely', async () => {
    const { app, gateway } = makeApp();
    await request(app)
      .post('/api/access/page-open')
      .send({ operationId: 'op_ipspoof', ip: '1.2.3.4', ip_address: '9.9.9.9' });

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_pageopen_op_ipspoof');
    expect(entry?.ip_address).not.toBe('1.2.3.4');
    expect(entry?.ip_address).not.toBe('9.9.9.9');
  });

  it('honors a proxy-forwarded IP via X-Forwarded-For (trust proxy configured)', async () => {
    const { app, gateway } = makeApp();
    await request(app)
      .post('/api/access/page-open')
      .set('X-Forwarded-For', '203.0.113.77')
      .send({ operationId: 'op_proxy' });

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_pageopen_op_proxy');
    expect(entry?.ip_address).toBe('203.0.113.77');
  });

  it('trusts only the single Firebase proxy hop, not an attacker-prepended chain entry', async () => {
    const { app, gateway } = makeApp();
    // A client cannot make itself look like it arrived from 203.0.113.1 by
    // prepending a fake hop in front of the real (rightmost) one that the
    // trusted Google proxy actually appended.
    await request(app)
      .post('/api/access/page-open')
      .set('X-Forwarded-For', '203.0.113.1, 203.0.113.200')
      .send({ operationId: 'op_multihop' });

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_pageopen_op_multihop');
    expect(entry?.ip_address).not.toBe('203.0.113.1');
    expect(entry?.ip_address).toBe('203.0.113.200');
  });

  it('returns a controlled 503 result (never a raw Google error) when the backend is unavailable', async () => {
    const app = createApp({ getGateway: () => null });
    const res = await request(app).post('/api/access/page-open').send({ operationId: 'op_x' });
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe('POST /api/auth/gate', () => {
  it('rejects malformed digits (a value containing more than one character)', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/gate')
      .send({
        digits: ['12', '3', '4', '5'],
        deviceId: 'device_1',
        attemptId: 'a1',
      });
    expect(res.status).toBe(400);
  });

  it('rejects a digits array that is not exactly length 4', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/gate')
      .send({ digits: ['1', '2', '3'], deviceId: 'device_1', attemptId: 'a2' });
    expect(res.status).toBe(400);
  });

  it('rejects missing deviceId', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/gate')
      .send({ digits: CORRECT_DIGITS, attemptId: 'a3' });
    expect(res.status).toBe(400);
  });

  it('rejects an unexpected extra top-level field', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/gate').send({
      digits: CORRECT_DIGITS,
      deviceId: 'device_1',
      attemptId: 'a4',
      extra: 'nope',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an incorrect Gate code with a generic 401 and never leaks the correct code', async () => {
    const { app, gateway } = makeApp();
    const res = await request(app)
      .post('/api/auth/gate')
      .send({
        digits: ['0', '0', '0', '0'],
        deviceId: 'device_1',
        attemptId: 'wrong1',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_GATE_CODE');
    const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(serialized).not.toContain(M02_FAKE_GATE_CODE);
    expect(res.headers['set-cookie']).toBeUndefined();

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_gate_failure_wrong1');
    expect(entry?.event_type).toBe('gate_failure');
    expect(entry?.access_result).toBe('failure');
  });

  it('accepts a correct Gate code, sets an HttpOnly owner cookie, and never returns a session ID in JSON', async () => {
    const { app, gateway } = makeApp();
    const res = await request(app).post('/api/auth/gate').send({
      digits: CORRECT_DIGITS,
      deviceId: 'device_1',
      language: 'en',
      attemptId: 'correct1',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.session).toMatchObject({
      kind: 'owner',
      userId: 'owner_fixture',
      status: 'active',
    });
    expect(res.body.session).not.toHaveProperty('sessionId');
    expect(JSON.stringify(res.body)).not.toContain('sess_gate_correct1');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const ownerCookie = setCookie.find((c: string) => c.startsWith('vw_owner_session='));
    expect(ownerCookie).toBeDefined();
    expect(ownerCookie).toContain('HttpOnly');
    expect(ownerCookie).toMatch(/SameSite=Lax/i);
    expect(ownerCookie).not.toMatch(/Secure/i);

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_gate_success_correct1');
    expect(entry?.event_type).toBe('gate_success');
    expect(entry?.access_result).toBe('success');
    expect(entry?.user_id).toBe('owner_fixture');
  });

  it('is idempotent: retrying the same successful attemptId reuses the same session without duplicating rows', async () => {
    const { app, gateway } = makeApp();
    const body = { digits: CORRECT_DIGITS, deviceId: 'device_1', attemptId: 'retry1' };

    const first = await request(app).post('/api/auth/gate').send(body);
    const second = await request(app).post('/api/auth/gate').send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.session.createdAt).toBe(first.body.session.createdAt);

    const sessions = await gateway.getRawTab('06_SESSIONS', { bypass: true });
    const [sHeader, ...sRows] = sessions;
    const idIdx = sHeader!.indexOf('session_id');
    expect(sRows.filter((r) => r[idIdx] === 'sess_gate_retry1')).toHaveLength(1);

    const logs = await readEntryLogs(gateway);
    expect(logs.filter((r) => r.log_id === 'log_gate_success_retry1')).toHaveLength(1);
  });

  it('creates an owner session expiring exactly 1440 minutes after creation', async () => {
    const { app } = makeApp(buildM02Workbook(), '2026-03-01T10:00:00.000Z');
    const res = await request(app)
      .post('/api/auth/gate')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_1', attemptId: 'exp1' });

    const created = Date.parse(res.body.session.createdAt);
    const expires = Date.parse(res.body.session.expiresAt);
    expect((expires - created) / 60_000).toBe(1440);
  });
});

describe('POST /api/auth/admin', () => {
  it('rejects unknown username generically', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/admin')
      .send({ username: 'nobody', password: 'x', deviceId: 'device_1', attemptId: 'u1' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_ADMIN_CREDENTIALS');
  });

  it('rejects wrong password generically', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/admin')
      .send({ username: 'admin_fixture', password: 'nope', deviceId: 'device_1', attemptId: 'u2' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_ADMIN_CREDENTIALS');
    expect(JSON.stringify(res.body)).not.toContain(M02_FAKE_ADMIN_PASSWORD);
  });

  it('rejects an inactive admin user with the same generic code', async () => {
    const workbook = buildM02Workbook();
    const header = workbook['02_USERS']![0]!;
    const activeIdx = header.indexOf('active');
    const idIdx = header.indexOf('user_id');
    const row = workbook['02_USERS']!.find((r) => r[idIdx] === 'admin_fixture')!;
    row[activeIdx] = 'FALSE';

    const { app } = makeApp(workbook);
    const res = await request(app).post('/api/auth/admin').send({
      username: 'admin_fixture',
      password: M02_FAKE_ADMIN_PASSWORD,
      deviceId: 'device_1',
      attemptId: 'u3',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_ADMIN_CREDENTIALS');
  });

  it('rejects a correct-password-but-wrong-role user (owner submitted as admin) with the same generic code', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/admin').send({
      username: 'owner_fixture',
      password: M02_FAKE_GATE_CODE,
      deviceId: 'device_1',
      attemptId: 'u4',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_ADMIN_CREDENTIALS');
  });

  it('accepts correct Admin credentials, sets an HttpOnly admin cookie, distinct from the owner cookie', async () => {
    const { app, gateway } = makeApp();
    const res = await request(app).post('/api/auth/admin').send({
      username: 'admin_fixture',
      password: M02_FAKE_ADMIN_PASSWORD,
      deviceId: 'device_1',
      attemptId: 'adminok1',
    });

    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({
      kind: 'admin',
      userId: 'admin_fixture',
      status: 'active',
    });
    expect(res.body.session).not.toHaveProperty('sessionId');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const adminCookie = setCookie.find((c: string) => c.startsWith('vw_admin_session='));
    expect(adminCookie).toBeDefined();
    expect(adminCookie).toContain('HttpOnly');
    expect(setCookie.some((c: string) => c.startsWith('vw_owner_session='))).toBe(false);

    const logs = await readEntryLogs(gateway);
    const entry = logs.find((r) => r.log_id === 'log_admin_success_adminok1');
    expect(entry?.event_type).toBe('admin_success');
  });

  it('creates an admin session expiring exactly 120 minutes after creation', async () => {
    const { app } = makeApp(buildM02Workbook(), '2026-03-01T10:00:00.000Z');
    const res = await request(app).post('/api/auth/admin').send({
      username: 'admin_fixture',
      password: M02_FAKE_ADMIN_PASSWORD,
      deviceId: 'device_1',
      attemptId: 'adminexp1',
    });

    const created = Date.parse(res.body.session.createdAt);
    const expires = Date.parse(res.body.session.expiresAt);
    expect((expires - created) / 60_000).toBe(120);
  });
});

describe('Gate rate limiting (maxAttempts=5, cooldownSeconds=10)', () => {
  it('the 5th consecutive wrong attempt still returns a normal 401, not a 429', async () => {
    const { app } = makeApp();
    let last;
    for (let i = 1; i <= 5; i++) {
      last = await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.100')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl1', attemptId: `rl1_${i}` });
    }
    expect(last!.status).toBe(401);
    expect(last!.body.code).toBe('INVALID_GATE_CODE');
    expect(last!.body.rateLimit?.remainingAttempts).toBe(0);
  });

  it('the 6th consecutive attempt (any credentials) is blocked with 429 and a safe retryAfterSeconds', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.101')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl2', attemptId: `rl2_${i}` });
    }
    const blocked = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.101')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl2', attemptId: 'rl2_6' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.rateLimit.retryAfterSeconds).toBe(10);
    expect(blocked.body.session).toBeUndefined();
  });

  it('does not create a duplicate rate_limited log when the same blocked attemptId is retried', async () => {
    const { app, gateway } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.102')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl3', attemptId: `rl3_${i}` });
    }
    await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.102')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl3', attemptId: 'rl3_blocked' });
    await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.102')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl3', attemptId: 'rl3_blocked' });

    const logs = await readEntryLogs(gateway);
    expect(logs.filter((r) => r.log_id === 'log_gate_ratelimited_rl3_blocked')).toHaveLength(1);
  });

  it('unblocks once the 10-second cooldown fully elapses (measured from backend time, not client time)', async () => {
    const { app, setNow } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.103')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl4', attemptId: `rl4_${i}` });
    }
    const stillBlocked = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.103')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl4', attemptId: 'rl4_trigger' });
    expect(stillBlocked.status).toBe(429);

    setNow('2026-01-01T00:00:11.000Z'); // 11s later — past the 10s cooldown
    const afterCooldown = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.103')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl4', attemptId: 'rl4_after' });
    expect(afterCooldown.status).toBe(200);
  });

  it('a successful login resets the failure chain', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 4; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.104')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl5', attemptId: `rl5_${i}` });
    }
    const success = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.104')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl5', attemptId: 'rl5_success' });
    expect(success.status).toBe(200);

    // 4 more failures after the reset should NOT trigger a block yet.
    let last;
    for (let i = 1; i <= 4; i++) {
      last = await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.104')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl5', attemptId: `rl5_post_${i}` });
    }
    expect(last!.status).toBe(401);
    expect(last!.body.code).toBe('INVALID_GATE_CODE');
  });

  it('scopes are independent by IP: a different IP starts with a fresh count', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.105')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl6', attemptId: `rl6a_${i}` });
    }
    const otherIp = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.106')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl6', attemptId: 'rl6b_1' });
    expect(otherIp.status).toBe(200);
  });

  it('scopes are independent by device: the same IP with a different device starts with a fresh count', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.107')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl7a', attemptId: `rl7a_${i}` });
    }
    const otherDevice = await request(app)
      .post('/api/auth/gate')
      .set('X-Forwarded-For', '203.0.113.107')
      .send({ digits: CORRECT_DIGITS, deviceId: 'device_rl7b', attemptId: 'rl7b_1' });
    expect(otherDevice.status).toBe(200);
  });

  it('Gate and Admin rate limits are independent flows', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post('/api/auth/gate')
        .set('X-Forwarded-For', '203.0.113.108')
        .send({ digits: ['0', '0', '0', '0'], deviceId: 'device_rl8', attemptId: `rl8_${i}` });
    }
    const adminAttempt = await request(app)
      .post('/api/auth/admin')
      .set('X-Forwarded-For', '203.0.113.108')
      .send({
        username: 'admin_fixture',
        password: M02_FAKE_ADMIN_PASSWORD,
        deviceId: 'device_rl8',
        attemptId: 'rl8_admin_1',
      });
    expect(adminAttempt.status).toBe(200);
  });
});

describe('Admin rate limiting (maxAttempts=3, cooldownSeconds=30)', () => {
  it('the 4th consecutive attempt is blocked with 429', async () => {
    const { app } = makeApp();
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post('/api/auth/admin')
        .set('X-Forwarded-For', '203.0.113.109')
        .send({
          username: 'admin_fixture',
          password: 'wrong',
          deviceId: 'device_arl1',
          attemptId: `arl1_${i}`,
        });
    }
    const blocked = await request(app)
      .post('/api/auth/admin')
      .set('X-Forwarded-For', '203.0.113.109')
      .send({
        username: 'admin_fixture',
        password: M02_FAKE_ADMIN_PASSWORD,
        deviceId: 'device_arl1',
        attemptId: 'arl1_4',
      });
    expect(blocked.status).toBe(429);
    expect(blocked.body.rateLimit.retryAfterSeconds).toBe(30);
  });
});
