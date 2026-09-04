import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { buildBootstrapResponse } from '../src/services/bootstrap.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function makeGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('buildBootstrapResponse', () => {
  it('returns exactly 5 enabled languages, 8 enabled locations, and 18 enabled first-journey beats', async () => {
    const response = await buildBootstrapResponse(makeGateway());

    expect(response.languages).toHaveLength(5);
    expect(response.locations).toHaveLength(8);
    expect(response.storyBeats).toHaveLength(18);
  });

  it('resolves the configured current event from 01_APP_CONFIG.current_event_id', async () => {
    const response = await buildBootstrapResponse(makeGateway());
    expect(response.currentEvent).not.toBeNull();
    expect(response.currentEvent!.eventId).toBe('birthday_2026');
  });

  it('uses an explicit allowlist for public app config (no arbitrary future config keys)', async () => {
    const response = await buildBootstrapResponse(makeGateway());
    expect(Object.keys(response.config).sort()).toEqual(
      ['appName', 'authoritativeTimeZone', 'defaultLanguage', 'normalStartLocation'].sort(),
    );
  });

  it('never exposes a raw Google Drive file ID in an asset descriptor', async () => {
    const response = await buildBootstrapResponse(makeGateway());
    expect(response.assets.length).toBeGreaterThan(0);
    for (const asset of response.assets) {
      expect(asset).not.toHaveProperty('driveFileId');
      expect(asset.mediaRef).toBeNull();
    }
    const serialized = JSON.stringify(response.assets);
    expect(serialized).not.toContain('fake_drive_id');
    expect(serialized).not.toMatch(/DRIVE_FILE_ID/);
  });

  it('never includes plaintext secrets, gate codes, or admin passwords anywhere in the payload', async () => {
    const serialized = JSON.stringify(await buildBootstrapResponse(makeGateway()));
    expect(serialized).not.toContain('fixture-admin-pass');
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
    expect(serialized).not.toContain('1234');
  });

  it('includes a request/correlation ID, sheet version, and a schema-health summary', async () => {
    const response = await buildBootstrapResponse(makeGateway());
    expect(typeof response.requestId).toBe('string');
    expect(response.requestId.length).toBeGreaterThan(0);
    expect(response.sheetVersion).toBe('0.2');
    expect(response.schemaHealth).toHaveProperty('status');
  });

  it('supports a read-only cache-bypass refresh without mutating the Sheet', async () => {
    const gateway = makeGateway();
    const first = await buildBootstrapResponse(gateway);
    const refreshed = await buildBootstrapResponse(gateway, { bypass: true });
    expect(refreshed.languages).toHaveLength(first.languages.length);
  });
});
