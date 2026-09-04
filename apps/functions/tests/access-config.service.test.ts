import { describe, expect, it } from 'vitest';
import { buildM02Workbook, M02_ACCEPTED_ACCESS_CONFIG } from '@veoullas-world/test-fixtures';
import { AppError } from '../src/errors/app-error.js';
import { loadAccessConfig } from '../src/services/access-config.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

function setConfigValue(
  workbook: Record<string, string[][]>,
  configKey: string,
  newValue: string,
): void {
  const tab = workbook['01_APP_CONFIG']!;
  const header = tab[0]!;
  const keyIdx = header.indexOf('config_key');
  const valueIdx = header.indexOf('value');
  const rowIdx = tab.findIndex((r, i) => i > 0 && r[keyIdx] === configKey);
  if (rowIdx === -1) throw new Error(`fixture setup: "${configKey}" not found`);
  tab[rowIdx]![valueIdx] = newValue;
}

function removeConfigRow(workbook: Record<string, string[][]>, configKey: string): void {
  const tab = workbook['01_APP_CONFIG']!;
  const header = tab[0]!;
  const keyIdx = header.indexOf('config_key');
  workbook['01_APP_CONFIG'] = tab.filter((r, i) => i === 0 || r[keyIdx] !== configKey);
}

function duplicateConfigRow(workbook: Record<string, string[][]>, configKey: string): void {
  const tab = workbook['01_APP_CONFIG']!;
  const header = tab[0]!;
  const keyIdx = header.indexOf('config_key');
  const original = tab.find((r, i) => i > 0 && r[keyIdx] === configKey);
  if (!original) throw new Error(`fixture setup: "${configKey}" not found`);
  workbook['01_APP_CONFIG'] = [...tab, [...original]];
}

describe('loadAccessConfig', () => {
  it('parses the exact accepted M02 configuration values', async () => {
    const gateway = gatewayFor(buildM02Workbook());
    const config = await loadAccessConfig(gateway);
    expect(config).toEqual(M02_ACCEPTED_ACCESS_CONFIG);
  });

  it('rejects a missing required configuration key', async () => {
    const workbook = buildM02Workbook();
    removeConfigRow(workbook, 'gate_max_attempts');
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('rejects a duplicated required configuration key', async () => {
    const workbook = buildM02Workbook();
    duplicateConfigRow(workbook, 'admin_max_attempts');
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('rejects a negative configuration value', async () => {
    const workbook = buildM02Workbook();
    setConfigValue(workbook, 'gate_cooldown_seconds', '-10');
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('rejects a non-integer configuration value', async () => {
    const workbook = buildM02Workbook();
    setConfigValue(workbook, 'session_heartbeat_seconds', 'thirty');
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('rejects a zero configuration value (out of accepted range)', async () => {
    const workbook = buildM02Workbook();
    setConfigValue(workbook, 'admin_cooldown_seconds', '0');
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('treats a disabled required row as missing', async () => {
    const workbook = buildM02Workbook();
    const tab = workbook['01_APP_CONFIG']!;
    const header = tab[0]!;
    const keyIdx = header.indexOf('config_key');
    const enabledIdx = header.indexOf('enabled');
    const rowIdx = tab.findIndex((r, i) => i > 0 && r[keyIdx] === 'session_heartbeat_seconds');
    tab[rowIdx]![enabledIdx] = 'FALSE';
    const gateway = gatewayFor(workbook);

    await expect(loadAccessConfig(gateway)).rejects.toMatchObject({
      code: 'ACCESS_CONFIG_INVALID',
    });
  });

  it('throws a real AppError instance carrying the safe error code', async () => {
    const workbook = buildM02Workbook();
    removeConfigRow(workbook, 'gate_max_attempts');
    const gateway = gatewayFor(workbook);

    try {
      await loadAccessConfig(gateway);
      expect.unreachable('loadAccessConfig should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });

  it('never exposes the Gate code, Admin password, or any 02_USERS field', async () => {
    const gateway = gatewayFor(buildM02Workbook());
    const config = await loadAccessConfig(gateway);
    const serialized = JSON.stringify(config);

    expect(serialized).not.toContain('4821');
    expect(serialized).not.toContain('fixture-admin-secret-only');
    expect(config).not.toHaveProperty('gateCode');
    expect(config).not.toHaveProperty('adminPassword');
    expect(Object.keys(config).sort()).toEqual(
      [
        'adminCooldownSeconds',
        'adminMaxAttempts',
        'adminSessionDurationMinutes',
        'gateCooldownSeconds',
        'gateMaxAttempts',
        'ownerSessionDurationMinutes',
        'sessionHeartbeatSeconds',
      ].sort(),
    );
  });
});
