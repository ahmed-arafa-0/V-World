import { describe, expect, it, vi } from 'vitest';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { AppError } from '../src/errors/app-error.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const KEYS_HEADER = [
  'key_type_id',
  'location_id',
  'display_name_text_id',
  'shape',
  'icon_id',
  'max_per_day',
  'rarity',
  'inventory_cap',
  'enabled',
  'notes',
];

function makeWorkbook(): Record<string, string[][]> {
  return {
    '21_KEYS': [
      [...KEYS_HEADER],
      [
        'key_shell',
        'beach',
        'key_shell_name',
        'shell',
        'icon_key_shell',
        '1',
        'common',
        '99',
        'TRUE',
        'original notes',
      ],
      [
        'key_candle',
        'church',
        'key_candle_name',
        'candle',
        'icon_key_shell',
        '1',
        'common',
        '99',
        'TRUE',
        'original notes',
      ],
    ],
    '39_VALIDATION_LISTS': [
      ['list_name', 'value', 'sort_order', 'enabled', 'notes'],
      ['location', 'beach', '1', 'TRUE', ''],
      ['location', 'church', '2', 'TRUE', ''],
    ],
  };
}

function makeGateway(workbook = makeWorkbook()) {
  const client = new FakeGoogleSheetsClient(workbook);
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  return { client, gateway, workbook };
}

describe('SheetGateway.readTab', () => {
  it('reads and normalizes rows for a registered tab', async () => {
    const { gateway } = makeGateway();
    const result = await gateway.readTab('21_KEYS');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.values.max_per_day).toBe(1);
    expect(result.rows[0]!.values.enabled).toBe(true);
  });

  it('detects a duplicate primary key rather than silently picking one row', async () => {
    const workbook = makeWorkbook();
    workbook['21_KEYS']!.push([...workbook['21_KEYS']![1]!]); // duplicate "key_shell"
    const { gateway } = makeGateway(workbook);

    await expect(gateway.findByPrimaryKey('21_KEYS', 'key_shell')).rejects.toThrow(AppError);
  });
});

describe('SheetGateway caching', () => {
  it('serves a cached read without a second client call', async () => {
    const { client, gateway } = makeGateway();
    await gateway.getRawTab('21_KEYS');
    await gateway.getRawTab('21_KEYS');
    expect(client.callCounts.getValues).toBe(1);
  });

  it('bypasses the cache when asked', async () => {
    const { client, gateway } = makeGateway();
    await gateway.getRawTab('21_KEYS');
    await gateway.getRawTab('21_KEYS', { bypass: true });
    expect(client.callCounts.getValues).toBe(2);
  });

  it('batch reads share one underlying call and populate the per-tab cache', async () => {
    const { client, gateway } = makeGateway();
    await gateway.getRawTabsBatch(['21_KEYS', '39_VALIDATION_LISTS']);
    expect(client.callCounts.batchGetValues).toBe(1);

    // A subsequent single-tab read should now be served from the cache the batch populated.
    await gateway.getRawTab('21_KEYS');
    expect(client.callCounts.getValues).toBe(0);

    await gateway.getRawTabsBatch(['21_KEYS', '39_VALIDATION_LISTS']);
    expect(client.callCounts.batchGetValues).toBe(1);
  });

  it('invalidates the relevant tab cache after a successful update', async () => {
    const { gateway } = makeGateway();
    await gateway.readTab('21_KEYS');
    await gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { notes: 'updated notes' });

    const result = await gateway.readTab('21_KEYS');
    expect(result.rows.find((r) => r.primaryKeyValue === 'key_shell')!.raw.notes).toBe(
      'updated notes',
    );
  });
});

describe('SheetGateway.updateByPrimaryKey', () => {
  it('updates only the explicitly supplied column', async () => {
    const { gateway } = makeGateway();
    const updated = await gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { max_per_day: '5' });
    expect(updated.max_per_day).toBe('5');
  });

  it('preserves unrelated and unknown columns exactly', async () => {
    const workbook = makeWorkbook();
    workbook['21_KEYS']![0]!.push('future_column');
    workbook['21_KEYS']![1]!.push('kept-value');
    const { gateway } = makeGateway(workbook);

    await gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { notes: 'changed' });

    const result = await gateway.findByPrimaryKey('21_KEYS', 'key_shell', { bypass: true });
    expect(result!.row.raw.shape).toBe('shell');
    expect(result!.row.raw.rarity).toBe('common');
    expect(result!.row.raw.future_column).toBe('kept-value');
    expect(result!.row.raw.notes).toBe('changed');
  });

  it('never writes to columns outside the patch (formula-column safety)', async () => {
    const { client, gateway } = makeGateway();
    await gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { notes: 'only this changes' });
    // Exactly one cell write for exactly one patched column — every other
    // column (including any that might hold a live formula) is never sent
    // in an update request at all.
    expect(client.callCounts.updateValues).toBe(1);
  });

  it('strips any attempt to change the primary key column itself', async () => {
    const { gateway } = makeGateway();
    const updated = await gateway.updateByPrimaryKey('21_KEYS', 'key_shell', {
      key_type_id: 'renamed',
      notes: 'changed',
    });
    expect(updated.key_type_id).toBe('key_shell');
  });

  it('throws ROW_NOT_FOUND for a missing primary key', async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.updateByPrimaryKey('21_KEYS', 'does-not-exist', { notes: 'x' }),
    ).rejects.toMatchObject({
      code: 'ROW_NOT_FOUND',
    });
  });

  it('serializes concurrent updates to the same row without corruption', async () => {
    const { gateway } = makeGateway();
    await Promise.all([
      gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { notes: 'from-a' }),
      gateway.updateByPrimaryKey('21_KEYS', 'key_shell', { notes: 'from-b' }),
    ]);

    // Both writes complete cleanly and the final state is exactly one of the
    // two intended values — never a mixture, and never a thrown conflict.
    const final = await gateway.findByPrimaryKey('21_KEYS', 'key_shell', { bypass: true });
    expect(['from-a', 'from-b']).toContain(final!.row.raw.notes);
  });
});

describe('SheetGateway.appendRow', () => {
  it('appends a row using header order regardless of the input object key order', async () => {
    const { client, gateway } = makeGateway();
    await gateway.appendRow('21_KEYS', {
      notes: 'new key',
      key_type_id: 'key_new',
      location_id: 'beach',
      enabled: 'TRUE',
    });

    const snapshot = client.getTabSnapshot('21_KEYS');
    const appended = snapshot[snapshot.length - 1]!;
    expect(appended[KEYS_HEADER.indexOf('key_type_id')]).toBe('key_new');
    expect(appended[KEYS_HEADER.indexOf('notes')]).toBe('new key');
  });

  it('rejects a duplicate primary key instead of appending a conflicting row', async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.appendRow('21_KEYS', { key_type_id: 'key_shell', location_id: 'beach' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PRIMARY_KEY' });
  });

  it('requires a non-blank primary key', async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.appendRow('21_KEYS', { key_type_id: '', location_id: 'beach' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});

describe('SheetGateway.appendIfAbsent (idempotency foundation)', () => {
  it('a retry with the same key returns the original row instead of duplicating it', async () => {
    const { client, gateway } = makeGateway();
    const buildRow = vi.fn().mockReturnValue({
      key_type_id: 'key_idem',
      location_id: 'beach',
      enabled: 'TRUE',
    });

    const first = await gateway.appendIfAbsent('21_KEYS', 'key_idem', buildRow);
    const retry = await gateway.appendIfAbsent('21_KEYS', 'key_idem', buildRow);

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.row).toEqual(first.row);
    expect(client.callCounts.appendValues).toBe(1);
  });
});
