import { describe, expect, it } from 'vitest';
import { parseTab } from '../src/row-schema.js';
import type { TableTabDefinition } from '../src/types.js';

const SAMPLE_TAB: TableTabDefinition = {
  name: '21_KEYS',
  kind: 'table',
  purpose: 'test',
  primaryKey: 'key_type_id',
  columns: [
    { name: 'key_type_id', kind: 'id' },
    { name: 'location_id', kind: 'text', controlledList: 'location' },
    { name: 'max_per_day', kind: 'integer' },
    { name: 'enabled', kind: 'boolean' },
    { name: 'metadata_json', kind: 'json' },
    { name: 'tags', kind: 'csv' },
    { name: 'awarded_at', kind: 'date' },
  ],
  sensitivity: 'Internal',
  readBy: 'React via backend',
  writeBy: 'Admin or backend',
  adminEditable: true,
};

const VALIDATION_LISTS = { location: new Set(['gate', 'beach', 'church']) };

function header(): string[] {
  return [
    'key_type_id',
    'location_id',
    'max_per_day',
    'enabled',
    'metadata_json',
    'tags',
    'awarded_at',
  ];
}

describe('parseTab', () => {
  it('ignores entirely blank rows', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [
        ['', '', '', '', '', '', ''],
        ['key_shell', 'beach', '1', 'TRUE', '{}', 'a,b', ''],
      ],
      VALIDATION_LISTS,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('normalizes boolean, integer, csv, json, and date columns', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['key_shell', 'beach', '3', 'TRUE', '{"a":1}', 'x, y', '2026-09-26']],
      VALIDATION_LISTS,
    );
    const row = result.rows[0]!;
    expect(row.values.max_per_day).toBe(3);
    expect(row.values.enabled).toBe(true);
    expect(row.values.metadata_json).toEqual({ a: 1 });
    expect(row.values.tags).toEqual(['x', 'y']);
    expect(row.values.awarded_at).toBe(new Date('2026-09-26').toISOString());
    expect(result.issues).toHaveLength(0);
  });

  it('keeps stable ID columns as strings even if numeric-looking', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['007', 'beach', '1', 'TRUE', '', '', '']],
      VALIDATION_LISTS,
    );
    expect(result.rows[0]!.values.key_type_id).toBe('007');
    expect(typeof result.rows[0]!.values.key_type_id).toBe('string');
  });

  it('reports missing required columns without crashing row parsing', () => {
    const headerMissingEnabled = header().filter((h) => h !== 'enabled');
    const result = parseTab(
      SAMPLE_TAB,
      headerMissingEnabled,
      [['key_shell', 'beach', '1', '{}', '', '']],
      VALIDATION_LISTS,
    );
    expect(result.missingColumns).toEqual(['enabled']);
    expect(result.rows).toHaveLength(1);
  });

  it('preserves unknown/future columns instead of discarding them', () => {
    const headerWithExtra = [...header(), 'future_column'];
    const result = parseTab(
      SAMPLE_TAB,
      headerWithExtra,
      [['key_shell', 'beach', '1', 'TRUE', '{}', '', '', 'surprise']],
      VALIDATION_LISTS,
    );
    expect(result.unknownColumns).toEqual(['future_column']);
    expect(result.rows[0]!.values.future_column).toBe('surprise');
  });

  it('detects a duplicate primary key rather than silently updating an arbitrary row', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [
        ['key_shell', 'beach', '1', 'TRUE', '', '', ''],
        ['key_shell', 'church', '2', 'TRUE', '', '', ''],
      ],
      VALIDATION_LISTS,
    );
    expect(result.duplicatePrimaryKeyValues).toEqual(['key_shell']);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_PRIMARY_KEY')).toBe(true);
  });

  it('flags a blank primary key', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['', 'beach', '1', 'TRUE', '', '', '']],
      VALIDATION_LISTS,
    );
    expect(result.issues.some((i) => i.code === 'BLANK_REQUIRED_ID')).toBe(true);
  });

  it('flags invalid boolean, integer, json, and date values without throwing', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['key_shell', 'beach', 'not-a-number', 'maybe', '{bad json', '', 'not-a-date']],
      VALIDATION_LISTS,
    );
    const codes = result.issues.map((i) => i.code).sort();
    expect(codes).toEqual(['INVALID_BOOLEAN', 'INVALID_DATE', 'INVALID_INTEGER', 'INVALID_JSON']);
  });

  it('flags a value outside its controlled list', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['key_shell', 'atlantis', '1', 'TRUE', '', '', '']],
      VALIDATION_LISTS,
    );
    expect(result.issues.some((i) => i.code === 'INVALID_CONTROLLED_VALUE')).toBe(true);
  });

  it('flags an un-replaced placeholder value', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['key_shell', '<PLACEHOLDER>', '1', 'TRUE', '', '', '']],
      VALIDATION_LISTS,
    );
    expect(result.issues.some((i) => i.code === 'PLACEHOLDER_VALUE')).toBe(true);
    expect(result.placeholderCount).toBe(1);
  });

  it('never crashes and always returns a sanitized message without echoing raw values', () => {
    const result = parseTab(
      SAMPLE_TAB,
      header(),
      [['key_shell', 'beach', 'oops', 'TRUE', '', '', '']],
      VALIDATION_LISTS,
    );
    for (const issue of result.issues) {
      expect(issue.message).not.toContain('oops');
    }
  });
});
