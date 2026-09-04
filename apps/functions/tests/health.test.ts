import { afterEach, describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { buildHealthResponse, resolveEnvironment } from '../src/api/health.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function makeGateway(): SheetGateway {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  return new SheetGateway(client, { ttlSeconds: 60 });
}

describe('buildHealthResponse', () => {
  it('reports a controlled sheets-unreachable status when no gateway is supplied', async () => {
    const before = Date.now();
    const response = await buildHealthResponse(null);
    const after = Date.now();

    expect(response.ok).toBe(true);
    expect(response.service).toBe('veoullas-world-functions');
    expect(response.milestone).toBe('M01');
    expect(response.sheets.reachable).toBe(false);
    expect(response.schemaHealth.status).toBe('error');
    expect(response.cache).toEqual({ entryCount: 0, ttlSeconds: 60 });

    const timestampMs = new Date(response.timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });

  it('reports the credential file status independently of the gateway (it reflects the real disk file)', async () => {
    const response = await buildHealthResponse(null);
    // This repository's config-private/google-service-account.json exists for
    // M01 preflight — the credential-missing path itself is covered directly
    // in google-credential-loader.test.ts using fixture directories.
    expect(typeof response.config.googleServiceAccount.present).toBe('boolean');
    expect(['not_configured', 'configured', 'invalid_format']).toContain(
      response.config.googleServiceAccount.reason,
    );
  });

  it('reports sheets reachable and a schema-health summary when a working gateway is provided', async () => {
    const response = await buildHealthResponse(makeGateway());

    expect(response.sheets.reachable).toBe(true);
    expect(['healthy', 'warning', 'error']).toContain(response.schemaHealth.status);
    expect(response.cache.ttlSeconds).toBe(60);
  });

  it('never includes a service-account email, file path, or credential fragment', async () => {
    const response = await buildHealthResponse(makeGateway());
    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/gserviceaccount\.com/);
    expect(serialized).not.toContain('config-private');
    expect(serialized).not.toContain('private_key');
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
