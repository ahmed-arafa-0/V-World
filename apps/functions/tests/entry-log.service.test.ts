import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  appendEntryLogIfAbsent,
  normalizeEntryLogLocale,
} from '../src/services/entry-log.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

describe('normalizeEntryLogLocale', () => {
  it('returns an exact supported locale unchanged', () => {
    expect(normalizeEntryLogLocale('en')).toBe('en');
    expect(normalizeEntryLogLocale('ar-EG')).toBe('ar-EG');
    expect(normalizeEntryLogLocale('it')).toBe('it');
    expect(normalizeEntryLogLocale('el')).toBe('el');
    expect(normalizeEntryLogLocale('fr')).toBe('fr');
  });

  it('maps a BCP-47 regional tag to its supported base language', () => {
    expect(normalizeEntryLogLocale('en-US')).toBe('en');
    expect(normalizeEntryLogLocale('en-GB')).toBe('en');
    expect(normalizeEntryLogLocale('it-IT')).toBe('it');
    expect(normalizeEntryLogLocale('el-GR')).toBe('el');
    expect(normalizeEntryLogLocale('fr-CA')).toBe('fr');
  });

  it('maps every Arabic variant to the one supported Arabic locale', () => {
    expect(normalizeEntryLogLocale('ar')).toBe('ar-EG');
    expect(normalizeEntryLogLocale('ar-SA')).toBe('ar-EG');
    expect(normalizeEntryLogLocale('ar-EG')).toBe('ar-EG');
  });

  it('is case-insensitive on the base language', () => {
    expect(normalizeEntryLogLocale('EN-us')).toBe('en');
  });

  it('normalizes an unsupported language to blank rather than an invalid value', () => {
    expect(normalizeEntryLogLocale('de-DE')).toBe('');
    expect(normalizeEntryLogLocale('ja')).toBe('');
    expect(normalizeEntryLogLocale('zh-CN')).toBe('');
  });

  it('leaves an already-blank or undefined value blank', () => {
    expect(normalizeEntryLogLocale('')).toBe('');
    expect(normalizeEntryLogLocale('   ')).toBe('');
    expect(normalizeEntryLogLocale(undefined)).toBe('');
  });
});

describe('appendEntryLogIfAbsent locale normalization', () => {
  it('writes the normalized locale, not the raw browser value, to the row', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await appendEntryLogIfAbsent(gateway, 'log-normalize-1', {
      eventType: 'page_open',
      accessResult: 'success',
      timestamp: '2026-09-16T00:00:00.000Z',
      ip: '203.0.113.5',
      language: 'en-US',
    });

    const raw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const header = raw[0]!;
    const idIdx = header.indexOf('log_id');
    const langIdx = header.indexOf('language');
    const row = raw.slice(1).find((r) => r[idIdx] === 'log-normalize-1');

    expect(row).toBeDefined();
    expect(row![langIdx]).toBe('en');
  });

  it('never rewrites a historical row already present in the sheet', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });

    await appendEntryLogIfAbsent(gateway, 'log-normalize-2', {
      eventType: 'page_open',
      accessResult: 'success',
      timestamp: '2026-09-16T00:00:01.000Z',
      ip: '203.0.113.6',
      language: 'fr-CA',
    });

    const after = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    // Every previously existing row is byte-for-byte unchanged; only one new
    // row was appended.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBe(before.length + 1);
  });

  it('writes blank language for an unsupported browser locale rather than an invalid value', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await appendEntryLogIfAbsent(gateway, 'log-normalize-3', {
      eventType: 'page_open',
      accessResult: 'success',
      timestamp: '2026-09-16T00:00:02.000Z',
      ip: '203.0.113.7',
      language: 'de-DE',
    });

    const raw = await gateway.getRawTab('05_ENTRY_LOGS', { bypass: true });
    const header = raw[0]!;
    const idIdx = header.indexOf('log_id');
    const langIdx = header.indexOf('language');
    const row = raw.slice(1).find((r) => r[idIdx] === 'log-normalize-3');

    expect(row![langIdx]).toBe('');
  });
});
