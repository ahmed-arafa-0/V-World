import { afterEach, describe, expect, it } from 'vitest';
import { buildHealthResponse, resolveEnvironment } from '../src/api/health.js';

describe('buildHealthResponse', () => {
  it('returns structured JSON with a server-generated timestamp and milestone M00', () => {
    const before = Date.now();
    const response = buildHealthResponse();
    const after = Date.now();

    expect(response.ok).toBe(true);
    expect(response.service).toBe('veoullas-world-functions');
    expect(response.milestone).toBe('M00');
    expect(response.config).toBeDefined();

    const timestampMs = new Date(response.timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });

  it('keeps working when Google credentials are missing, with a controlled backend-only status', () => {
    const response = buildHealthResponse();

    expect(response.ok).toBe(true);
    expect(response.config.googleServiceAccount.present).toBe(false);
    expect(response.config.googleServiceAccount.reason).toBe('not_configured');
  });
});

describe('resolveEnvironment', () => {
  const originalEmulator = process.env.FUNCTIONS_EMULATOR;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.FUNCTIONS_EMULATOR = originalEmulator;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('detects the Functions emulator', () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    expect(resolveEnvironment()).toBe('emulator');
  });

  it('defaults to local outside the emulator and production', () => {
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.NODE_ENV = 'test';
    expect(resolveEnvironment()).toBe('local');
  });
});
