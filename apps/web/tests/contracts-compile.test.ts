import { describe, expect, it } from 'vitest';
import type {
  AdminLoginRequest,
  AdminLoginResult,
  ApiError,
  BackendConfigStatus,
  BootstrapResponse,
  GateLoginRequest,
  GateLoginResult,
  HealthResponse,
  PageOpenEvent,
  RateLimitedResponse,
  SafeSessionSummary,
  SchemaHealthResponse,
  SessionHeartbeatResult,
  SessionLogoutResult,
  SessionResumeResult,
} from '@veoullas-world/contracts';

describe('shared contracts compile and are usable from the frontend', () => {
  it('builds a valid HealthResponse using the shared type', () => {
    const config: BackendConfigStatus = {
      googleServiceAccount: { present: false, reason: 'not_configured' },
    };
    const health: HealthResponse = {
      ok: true,
      service: 'veoullas-world-functions',
      environment: 'local',
      timestamp: new Date().toISOString(),
      milestone: 'M01',
      config,
      sheets: { reachable: true },
      schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
      cache: { entryCount: 0, ttlSeconds: 60 },
    };

    expect(health.service).toBe('veoullas-world-functions');
    expect(health.config.googleServiceAccount.present).toBe(false);
    expect(health.sheets.reachable).toBe(true);
  });

  it('builds a valid ApiError using the shared type', () => {
    const error: ApiError = { ok: false, code: 'not_found', message: 'nope' };
    expect(error.ok).toBe(false);
  });

  it('builds a valid BootstrapResponse using the shared type', () => {
    const bootstrap: BootstrapResponse = {
      ok: true,
      config: {
        appName: "Veoulla's World",
        defaultLanguage: 'en',
        normalStartLocation: 'cottage',
        authoritativeTimeZone: 'Africa/Cairo',
      },
      languages: [],
      locations: [],
      storyBeats: [],
      icons: [],
      assets: [],
      currentEvent: null,
      sheetVersion: '0.2',
      cacheGeneratedAt: new Date().toISOString(),
      schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
      requestId: 'test-request-id',
    };

    expect(bootstrap.config.appName).toBe("Veoulla's World");
  });

  it('builds a valid SchemaHealthResponse using the shared type', () => {
    const schemaHealth: SchemaHealthResponse = {
      ok: true,
      summary: {
        status: 'healthy',
        expectedTabCount: 42,
        foundTabCount: 42,
        healthyTabCount: 42,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        checkedAt: new Date().toISOString(),
      },
      tabs: [],
      diagnostics: [],
      note: 'M02 protection required',
    };

    expect(schemaHealth.summary.expectedTabCount).toBe(42);
  });

  it('builds a valid SafeSessionSummary using the shared type (never a session ID, Gate code, or password)', () => {
    const session: SafeSessionSummary = {
      kind: 'owner',
      userId: 'veoulla',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    expect(session.kind).toBe('owner');
    expect(Object.keys(session)).not.toContain('sessionId');
    expect(Object.keys(session)).not.toContain('gateCode');
    expect(Object.keys(session)).not.toContain('password');
  });

  it('builds a valid GateLoginRequest/GateLoginResult pair using the shared types', () => {
    const request: GateLoginRequest = {
      digits: ['1', '2', '3', '4'],
      deviceId: 'device_1',
      language: 'en',
      attemptId: 'attempt_1',
    };
    const success: GateLoginResult = {
      ok: true,
      session: {
        kind: 'owner',
        userId: 'veoulla',
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    };
    const failure: GateLoginResult = { ok: false, code: 'INVALID_GATE_CODE', message: 'nope' };
    const rateLimited: GateLoginResult = {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'nope',
      rateLimit: {
        maxAttempts: 5,
        remainingAttempts: 0,
        cooldownSeconds: 10,
        cooldownEndsAt: null,
        retryAfterSeconds: 10,
      },
    };

    expect(request.digits).toEqual(['1', '2', '3', '4']);
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    expect(rateLimited.ok).toBe(false);
  });

  it('builds a valid AdminLoginRequest/AdminLoginResult pair using the shared types', () => {
    const request: AdminLoginRequest = {
      username: 'admin_ahmed',
      password: 'not-real',
      deviceId: 'device_1',
      attemptId: 'attempt_2',
    };
    const result: AdminLoginResult = {
      ok: false,
      code: 'INVALID_ADMIN_CREDENTIALS',
      message: 'nope',
    };

    expect(request.username).toBe('admin_ahmed');
    expect(result.ok).toBe(false);
  });

  it('builds valid session lifecycle results using the shared types', () => {
    const resume: SessionResumeResult = { ok: false, code: 'SESSION_EXPIRED', message: 'nope' };
    const heartbeat: SessionHeartbeatResult = {
      ok: false,
      code: 'SESSION_TERMINATED',
      message: 'nope',
    };
    const forbidden: SessionResumeResult = {
      ok: false,
      code: 'SESSION_FORBIDDEN',
      message: 'nope',
    };
    const logout: SessionLogoutResult = { ok: true };

    expect(resume.ok).toBe(false);
    expect(heartbeat.ok).toBe(false);
    expect(forbidden.ok).toBe(false);
    expect(logout.ok).toBe(true);
  });

  it('builds a valid PageOpenEvent and RateLimitedResponse using the shared types', () => {
    const pageOpen: PageOpenEvent = {
      operationId: 'op_1',
      language: 'en',
      route: '/',
      deviceId: 'device_1',
    };
    const rateLimited: RateLimitedResponse = {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'nope',
      rateLimit: {
        maxAttempts: 3,
        remainingAttempts: 0,
        cooldownSeconds: 30,
        cooldownEndsAt: null,
        retryAfterSeconds: 30,
      },
    };

    expect(pageOpen.operationId).toBe('op_1');
    expect(rateLimited.rateLimit.maxAttempts).toBe(3);
  });
});
