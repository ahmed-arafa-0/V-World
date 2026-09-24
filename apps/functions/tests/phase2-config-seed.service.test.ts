import { describe, expect, it } from 'vitest';
import { WORLD_UI_TEXT } from '@veoullas-world/contracts';
import {
  buildWorldUiTextRows,
  seedPhase2EntryEventTypes,
  seedWorldUiText,
} from '../src/services/phase2-config-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Phase 2 config seed', () => {
  it('builds exactly five locale rows per label, with the right direction', () => {
    const rows = buildWorldUiTextRows();
    expect(rows).toHaveLength(Object.keys(WORLD_UI_TEXT).length * 5);
    const church = rows.filter((r) => r.text_id === 'world_church_light_candle');
    expect(church.map((r) => r.locale)).toEqual(['en', 'ar-EG', 'it', 'el', 'fr']);
    expect(church.find((r) => r.locale === 'ar-EG')?.direction).toBe('rtl');
    expect(new Set(rows.map((r) => r.ui_text_row_id)).size).toBe(rows.length);
  });

  it('every label is complete in all five languages and Arabic labels use Arabic script (except fixed proper names)', () => {
    const proper = new Set([
      'place_cafe',
      'place_arcade',
      'place_cottage',
      'place_farm',
      'place_museum',
      'walkman',
      'church_quiz',
    ]);
    for (const [key, labels] of Object.entries(WORLD_UI_TEXT)) {
      expect(labels, key).toHaveLength(5);
      for (const label of labels) expect(label.trim().length, key).toBeGreaterThan(0);
      if (!proper.has(key)) expect(labels[1], key).toMatch(/[؀-ۿ]/);
    }
  });

  it('is idempotent and never overwrites an existing row', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const first = await seedWorldUiText(gateway);
    expect(first.created.length).toBe(buildWorldUiTextRows().length);
    await gateway.updateByPrimaryKey('08_UI_TEXT', 'ui_world_close_en', { text: 'Hand edited' });
    const second = await seedWorldUiText(gateway);
    expect(second.created).toEqual([]);
    const row = await gateway.findByPrimaryKey('08_UI_TEXT', 'ui_world_close_en', { bypass: true });
    expect(row?.row.raw.text).toBe('Hand edited');
  });

  it('adds the two Phase 2 log event types once', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    expect((await seedPhase2EntryEventTypes(gateway)).created).toEqual([
      'first_journey_completed',
      'song_request',
    ]);
    expect((await seedPhase2EntryEventTypes(gateway)).created).toEqual([]);
  });
});
