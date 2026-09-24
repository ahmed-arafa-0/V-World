import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadGoogleServiceAccount,
  resolveCredentialPath,
} from '../src/config/google-credential-loader.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(dirname, 'fixtures');

describe('loadGoogleServiceAccount', () => {
  it('reports not_configured when no credential file exists at the given path', () => {
    const result = loadGoogleServiceAccount(path.join(fixturesDir, 'does-not-exist'));

    expect(result.status).toEqual({
      googleServiceAccount: { present: false, reason: 'not_configured' },
    });
    expect(result.credential).toBeNull();
  });

  it('reports invalid_format for a malformed JSON file instead of throwing', () => {
    const result = loadGoogleServiceAccount(path.join(fixturesDir, 'invalid-json'));

    expect(result.status.googleServiceAccount).toEqual({
      present: false,
      reason: 'invalid_format',
    });
    expect(result.credential).toBeNull();
  });

  it('reports invalid_format when required fields are missing', () => {
    const result = loadGoogleServiceAccount(path.join(fixturesDir, 'missing-fields'));

    expect(result.status.googleServiceAccount).toEqual({
      present: false,
      reason: 'invalid_format',
    });
    expect(result.credential).toBeNull();
  });

  it('reports configured when the credential has the required fields', () => {
    const result = loadGoogleServiceAccount(path.join(fixturesDir, 'valid'));

    expect(result.status).toEqual({
      googleServiceAccount: { present: true, reason: 'configured' },
    });
    expect(result.credential).not.toBeNull();
  });

  it('never leaks credential contents through the typed status object', () => {
    const result = loadGoogleServiceAccount(path.join(fixturesDir, 'valid'));

    expect(JSON.stringify(result.status)).not.toContain('test-fixture-not-a-real-key');
    expect(JSON.stringify(result.status)).not.toContain('fixture@example.invalid');
  });

  it('resolves the default credential path under apps/functions/config-private', () => {
    const resolved = resolveCredentialPath().replace(/\\/g, '/');

    expect(resolved).toMatch(/config-private\/google-service-account\.json$/);
  });

  describe('GOOGLE_SERVICE_ACCOUNT_PATH override', () => {
    afterEach(() => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
    });

    it('uses the env var verbatim as the full file path when set, instead of the default dir', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_PATH = '/etc/secrets/google-service-account.json';
      expect(resolveCredentialPath()).toBe('/etc/secrets/google-service-account.json');
    });

    it('loads a real credential from the env-var path', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_PATH = path.join(
        fixturesDir,
        'valid',
        'google-service-account.json',
      );
      const result = loadGoogleServiceAccount();
      expect(result.status).toEqual({
        googleServiceAccount: { present: true, reason: 'configured' },
      });
    });

    it('an explicit configDir argument (tests) still overrides the env var', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_PATH = '/should/not/be/used.json';
      const result = loadGoogleServiceAccount(path.join(fixturesDir, 'does-not-exist'));
      expect(result.status.googleServiceAccount.present).toBe(false);
    });
  });
});
