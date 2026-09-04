import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK, BROKEN_WORKBOOK } from '@veoullas-world/test-fixtures';
import { computeSchemaHealth } from '../src/services/schema-health.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

describe('computeSchemaHealth — healthy workbook', () => {
  it('reports healthy overall status with exactly 42 expected tabs, allowing known placeholder warnings', async () => {
    const health = await computeSchemaHealth(gatewayFor(GOOD_WORKBOOK));

    expect(health.summary.expectedTabCount).toBe(42);
    expect(health.summary.foundTabCount).toBe(42);
    expect(health.summary.errorCount).toBe(0);
    expect(['healthy', 'warning']).toContain(health.summary.status);
  });

  it('flags the intentional Drive-file placeholder as a WARNING, not an ERROR, and does not block bootstrap', async () => {
    const health = await computeSchemaHealth(gatewayFor(GOOD_WORKBOOK));
    const placeholderDiagnostics = health.diagnostics.filter((d) => d.code === 'PLACEHOLDER_VALUE');

    expect(placeholderDiagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of placeholderDiagnostics) {
      expect(diagnostic.severity).toBe('WARNING');
    }
  });

  it('never includes sensitive values in any diagnostic message', async () => {
    const health = await computeSchemaHealth(gatewayFor(GOOD_WORKBOOK));
    const serialized = JSON.stringify(health);

    expect(serialized).not.toContain('fixture-admin-pass');
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
    expect(serialized).not.toContain('fake_drive_id');
  });

  it('redacts the column name (not just the value) for a sensitive column with a diagnostic', async () => {
    const workbook = structuredClone(GOOD_WORKBOOK);
    const usersHeader = workbook['02_USERS']![0]!;
    const gateCodeIdx = usersHeader.indexOf('gate_code_plaintext');
    workbook['02_USERS']![1]![gateCodeIdx] = '<PLACEHOLDER>';

    const health = await computeSchemaHealth(gatewayFor(workbook));
    const diagnostic = health.diagnostics.find(
      (d) => d.tab === '02_USERS' && d.code === 'PLACEHOLDER_VALUE',
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic!.column).toBe('[redacted]');
    expect(diagnostic!.message).not.toContain('gate_code_plaintext');
    expect(JSON.stringify(health)).not.toContain('gate_code_plaintext');
  });
});

describe('computeSchemaHealth — broken workbook', () => {
  it('reports an ERROR status', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(health.summary.status).toBe('error');
    expect(health.summary.errorCount).toBeGreaterThan(0);
  });

  it('detects a missing tab', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(health.summary.foundTabCount).toBe(41);
    const missing = health.diagnostics.filter((d) => d.code === 'TAB_MISSING');
    expect(missing.some((d) => d.tab === '18_EVENT_PHASES')).toBe(true);
  });

  it('detects a duplicate primary key', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some((d) => d.code === 'DUPLICATE_PRIMARY_KEY' && d.tab === '21_KEYS'),
    ).toBe(true);
  });

  it('detects a blank primary key', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some((d) => d.code === 'BLANK_REQUIRED_ID' && d.tab === '11_LOCATIONS'),
    ).toBe(true);
  });

  it('detects an invalid boolean value', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some((d) => d.code === 'INVALID_BOOLEAN' && d.tab === '07_LANGUAGES'),
    ).toBe(true);
  });

  it('detects an invalid controlled-list value', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some(
        (d) => d.code === 'INVALID_CONTROLLED_VALUE' && d.tab === '07_LANGUAGES',
      ),
    ).toBe(true);
  });

  it('detects an invalid integer value', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some((d) => d.code === 'INVALID_INTEGER' && d.tab === '14_STORY_BEATS'),
    ).toBe(true);
  });

  it('detects a broken cross-tab reference', async () => {
    const health = await computeSchemaHealth(gatewayFor(BROKEN_WORKBOOK));
    expect(
      health.diagnostics.some(
        (d) =>
          d.code === 'INVALID_REFERENCE' && d.tab === '22_KEY_RULES' && d.column === 'key_type_id',
      ),
    ).toBe(true);
  });
});
