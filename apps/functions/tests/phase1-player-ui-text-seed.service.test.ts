import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  PLAYER_UI_TEXT_GROUPS,
  buildPlayerUiTextRows,
  seedPlayerUiText,
} from '../src/services/phase1-player-ui-text-seed.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function sheet(): { client: FakeGoogleSheetsClient; gateway: SheetGateway } {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  return { client, gateway: new SheetGateway(client, { ttlSeconds: 60 }) };
}

describe('player UI text seed', () => {
  it('builds one row per group per locale with the 08_UI_TEXT conventions', () => {
    const rows = buildPlayerUiTextRows();
    expect(rows).toHaveLength(PLAYER_UI_TEXT_GROUPS.length * 5);
    const ar = rows.find((r) => r.ui_text_row_id === 'player_forward_ar')!;
    expect(ar).toMatchObject({
      text_id: 'player_forward',
      locale: 'ar-EG',
      direction: 'rtl',
      text: 'اتقدمي',
      aria_label: 'اتقدمي',
      enabled: 'TRUE',
    });
    expect(new Set(rows.map((r) => r.ui_text_row_id)).size).toBe(rows.length);
    for (const group of PLAYER_UI_TEXT_GROUPS) {
      expect(rows.filter((r) => r.text_id === group.textId).map((r) => r.locale)).toEqual([
        'en',
        'ar-EG',
        'it',
        'el',
        'fr',
      ]);
    }
  });

  it('appends in one batch write and is idempotent', async () => {
    const { client, gateway } = sheet();
    const first = await seedPlayerUiText(gateway);
    expect(first.created).toHaveLength(PLAYER_UI_TEXT_GROUPS.length * 5);
    expect(client.callCounts.appendValues).toBe(1);
    const second = await seedPlayerUiText(gateway);
    expect(second.created).toHaveLength(0);
    expect(second.existing).toHaveLength(PLAYER_UI_TEXT_GROUPS.length * 5);
    expect(client.callCounts.appendValues).toBe(1);
  });

  it('never touches an existing row, even a hand-edited translation', async () => {
    const { gateway } = sheet();
    await gateway.appendRow('08_UI_TEXT', {
      ui_text_row_id: 'player_forward_it',
      text_id: 'player_forward',
      screen_id: 'player',
      component_id: 'forward',
      locale: 'it',
      text: 'Vai avanti (edited)',
      direction: 'ltr',
      aria_label: 'Vai avanti',
      enabled: 'TRUE',
      version: '4',
    });
    const outcome = await seedPlayerUiText(gateway);
    expect(outcome.existing).toEqual(['player_forward_it']);
    const row = await gateway.findByPrimaryKey('08_UI_TEXT', 'player_forward_it', {
      bypass: true,
    });
    expect(row?.row.raw.text).toBe('Vai avanti (edited)');
    expect(row?.row.raw.version).toBe('4');
  });
});
