import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  ACCESS_CONFIG_SEED_ROWS,
  ENTRY_EVENT_TYPE_VALUES,
  seedAccessAppConfig,
  seedEntryEventTypeValidationList,
} from '../src/services/access-config-seed.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

describe('seedAccessAppConfig', () => {
  it('creates all seven rows on a workbook that has none of them yet', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const outcome = await seedAccessAppConfig(gateway);

    expect(outcome.created).toHaveLength(ACCESS_CONFIG_SEED_ROWS.length);
    expect(outcome.updated).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(0);
  });

  it('is idempotent: rerunning creates nothing new and reports everything unchanged', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedAccessAppConfig(gateway);
    const afterFirstRun = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });

    const outcome = await seedAccessAppConfig(gateway);
    expect(outcome.created).toHaveLength(0);
    expect(outcome.updated).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(ACCESS_CONFIG_SEED_ROWS.length);

    const afterSecondRun = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });
    expect(afterSecondRun.length).toBe(afterFirstRun.length);
  });

  it('never creates a duplicate row for the same config_key across repeated runs', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedAccessAppConfig(gateway);
    await seedAccessAppConfig(gateway);
    await seedAccessAppConfig(gateway);

    const raw = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('config_key');
    const keys = raw.slice(1).map((r) => r[keyIdx]);
    const seededKeys = keys.filter((k) => ACCESS_CONFIG_SEED_ROWS.some((s) => s.config_key === k));

    expect(new Set(seededKeys).size).toBe(seededKeys.length);
  });

  it('updates a drifted row back to the accepted value without duplicating it', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedAccessAppConfig(gateway);
    await gateway.updateByPrimaryKey('01_APP_CONFIG', 'gate_max_attempts', { value: '999' });

    const outcome = await seedAccessAppConfig(gateway);
    expect(outcome.updated).toContain('gate_max_attempts');

    const raw = await gateway.getRawTab('01_APP_CONFIG', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('config_key');
    const valueIdx = header.indexOf('value');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'gate_max_attempts');

    expect(matches).toHaveLength(1);
    expect(matches[0]![valueIdx]).toBe('5');
  });

  it('never reads or writes 02_USERS (Gate code / Admin password are untouched)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const usersBefore = await gateway.getRawTab('02_USERS', { bypass: true });

    await seedAccessAppConfig(gateway);

    const usersAfter = await gateway.getRawTab('02_USERS', { bypass: true });
    expect(usersAfter).toEqual(usersBefore);
  });
});

describe('seedEntryEventTypeValidationList', () => {
  it('creates all eleven entry_event_type values on a workbook missing them', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const outcome = await seedEntryEventTypeValidationList(gateway);
    expect(outcome.created).toHaveLength(ENTRY_EVENT_TYPE_VALUES.length);
  });

  it('is idempotent and inserts without creating duplicate list_name+value pairs', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedEntryEventTypeValidationList(gateway);
    const afterFirstRun = await gateway.getRawTab('39_VALIDATION_LISTS', { bypass: true });

    const outcome = await seedEntryEventTypeValidationList(gateway);
    expect(outcome.created).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(ENTRY_EVENT_TYPE_VALUES.length);

    const afterSecondRun = await gateway.getRawTab('39_VALIDATION_LISTS', { bypass: true });
    expect(afterSecondRun.length).toBe(afterFirstRun.length);

    const header = afterSecondRun[0]!;
    const nameIdx = header.indexOf('list_name');
    const valueIdx = header.indexOf('value');
    const pairs = afterSecondRun
      .slice(1)
      .filter((r) => r[nameIdx] === 'entry_event_type')
      .map((r) => `${r[nameIdx]}|${r[valueIdx]}`);

    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('adds every value as enabled with sequential sort order', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedEntryEventTypeValidationList(gateway);

    const raw = await gateway.getRawTab('39_VALIDATION_LISTS', { bypass: true });
    const header = raw[0]!;
    const nameIdx = header.indexOf('list_name');
    const valueIdx = header.indexOf('value');
    const enabledIdx = header.indexOf('enabled');
    const sortIdx = header.indexOf('sort_order');

    const entries = raw.slice(1).filter((r) => r[nameIdx] === 'entry_event_type');
    expect(entries).toHaveLength(ENTRY_EVENT_TYPE_VALUES.length);
    for (const entry of entries) {
      expect(entry[enabledIdx]).toBe('TRUE');
      expect(Number(entry[sortIdx])).toBeGreaterThan(0);
    }
    expect(entries.map((e) => e[valueIdx]).sort()).toEqual([...ENTRY_EVENT_TYPE_VALUES].sort());
  });
});
