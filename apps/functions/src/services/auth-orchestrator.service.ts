import type { AdminLoginResult, GateLoginResult, RateLimitState } from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { loadAccessConfig } from './access-config.service.js';
import { appendEntryLogIfAbsent } from './entry-log.service.js';
import { evaluateRateLimit, type RateLimitDecision } from './rate-limit.service.js';
import {
  buildSessionId,
  createOrReconcileSession,
  toSafeSessionSummary,
} from './session.service.js';

const GATE_CODE_ID = 'gate_v1';

function toRateLimitState(decision: RateLimitDecision): RateLimitState {
  return {
    maxAttempts: decision.maxAttempts,
    remainingAttempts: decision.remainingAttempts,
    cooldownSeconds: decision.cooldownSeconds,
    cooldownEndsAt:
      decision.cooldownEndsAtMs === null ? null : new Date(decision.cooldownEndsAtMs).toISOString(),
    retryAfterSeconds: decision.retryAfterSeconds,
  };
}

export interface GateLoginInput {
  digits: string;
  deviceId: string;
  attemptId: string;
  language?: string;
  ip: string;
}

/**
 * The full Gate-login orchestration (see `services/session-resolution.service.ts`
 * for the counterpart resume/heartbeat/logout state machine). Nine steps,
 * exactly as specified: validate (done by the caller before this is
 * invoked) -> resolve IP (done by the caller) -> load config -> evaluate
 * rate limit -> load the private active owner -> compare in the backend
 * only -> on failure log + generic error -> on success create/reconcile
 * session + log + return a safe summary (the caller sets the cookie).
 */
export async function attemptGateLogin(
  gateway: SheetGateway,
  input: GateLoginInput,
  now: Date,
): Promise<GateLoginResult> {
  const config = await loadAccessConfig(gateway, { bypass: true });

  const preCheck = await evaluateRateLimit(
    gateway,
    'gate',
    input.ip,
    input.deviceId,
    config.gateMaxAttempts,
    config.gateCooldownSeconds,
    now,
    input.attemptId,
  );

  if (preCheck.blocked) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again later.',
      rateLimit: toRateLimitState(preCheck),
    };
  }

  const users = await gateway.readTab('02_USERS', { bypass: true });
  const owner = users.rows.find((r) => r.raw.role === 'owner' && r.values.active === true);
  const validCode = owner !== undefined && owner.raw.gate_code_plaintext === input.digits;

  if (!validCode) {
    await appendEntryLogIfAbsent(gateway, `log_gate_failure_${input.attemptId}`, {
      eventType: 'gate_failure',
      accessResult: 'failure',
      timestamp: now.toISOString(),
      ip: input.ip,
      deviceId: input.deviceId,
      language: input.language,
    });

    return {
      ok: false,
      code: 'INVALID_GATE_CODE',
      message: 'Incorrect Gate code.',
      rateLimit: {
        maxAttempts: preCheck.maxAttempts,
        remainingAttempts: Math.max(0, preCheck.remainingAttempts - 1),
        cooldownSeconds: preCheck.cooldownSeconds,
        cooldownEndsAt: null,
        retryAfterSeconds: null,
      },
    };
  }

  const sessionId = buildSessionId('gate', input.attemptId);
  const expiresAt = new Date(now.getTime() + config.ownerSessionDurationMinutes * 60_000);
  const { row } = await createOrReconcileSession(gateway, {
    sessionId,
    userId: owner.primaryKeyValue!,
    ip: input.ip,
    deviceId: input.deviceId,
    createdAt: now,
    expiresAt,
    gateCodeId: GATE_CODE_ID,
    currentLocation: 'gate',
    currentStoryBeat: 'beat_01',
  });

  await appendEntryLogIfAbsent(gateway, `log_gate_success_${input.attemptId}`, {
    eventType: 'gate_success',
    accessResult: 'success',
    timestamp: now.toISOString(),
    ip: input.ip,
    deviceId: input.deviceId,
    userId: owner.primaryKeyValue!,
    sessionId,
    language: input.language,
  });

  return {
    ok: true,
    session: toSafeSessionSummary(row, 'owner'),
  };
}

export interface AdminLoginInput {
  username: string;
  password: string;
  deviceId: string;
  attemptId: string;
  language?: string;
  ip: string;
}

export async function attemptAdminLogin(
  gateway: SheetGateway,
  input: AdminLoginInput,
  now: Date,
): Promise<AdminLoginResult> {
  const config = await loadAccessConfig(gateway, { bypass: true });

  const preCheck = await evaluateRateLimit(
    gateway,
    'admin',
    input.ip,
    input.deviceId,
    config.adminMaxAttempts,
    config.adminCooldownSeconds,
    now,
    input.attemptId,
  );

  if (preCheck.blocked) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again later.',
      rateLimit: toRateLimitState(preCheck),
    };
  }

  const users = await gateway.readTab('02_USERS', { bypass: true });
  const admin = users.rows.find(
    (r) =>
      r.primaryKeyValue === input.username && r.raw.role === 'admin' && r.values.active === true,
  );
  const validPassword =
    admin !== undefined && admin.raw.admin_password_plaintext === input.password;

  if (!validPassword) {
    await appendEntryLogIfAbsent(gateway, `log_admin_failure_${input.attemptId}`, {
      eventType: 'admin_failure',
      accessResult: 'failure',
      timestamp: now.toISOString(),
      ip: input.ip,
      deviceId: input.deviceId,
      language: input.language,
    });

    return {
      ok: false,
      code: 'INVALID_ADMIN_CREDENTIALS',
      message: 'Incorrect Admin credentials.',
      rateLimit: {
        maxAttempts: preCheck.maxAttempts,
        remainingAttempts: Math.max(0, preCheck.remainingAttempts - 1),
        cooldownSeconds: preCheck.cooldownSeconds,
        cooldownEndsAt: null,
        retryAfterSeconds: null,
      },
    };
  }

  const sessionId = buildSessionId('admin', input.attemptId);
  const expiresAt = new Date(now.getTime() + config.adminSessionDurationMinutes * 60_000);
  const { row } = await createOrReconcileSession(gateway, {
    sessionId,
    userId: admin.primaryKeyValue!,
    ip: input.ip,
    deviceId: input.deviceId,
    createdAt: now,
    expiresAt,
  });

  await appendEntryLogIfAbsent(gateway, `log_admin_success_${input.attemptId}`, {
    eventType: 'admin_success',
    accessResult: 'success',
    timestamp: now.toISOString(),
    ip: input.ip,
    deviceId: input.deviceId,
    userId: admin.primaryKeyValue!,
    sessionId,
    language: input.language,
  });

  return {
    ok: true,
    session: toSafeSessionSummary(row, 'admin'),
  };
}

/** Thrown by route handlers when the backend Sheet gateway is unavailable — never leaks provider details. */
export function backendUnavailableError(): AppError {
  return new AppError(
    'ACCESS_SERVICE_UNAVAILABLE',
    'The access service is temporarily unavailable.',
  );
}
