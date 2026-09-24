import { describe, expect, it } from 'vitest';
import {
  BEAT_TITLE_TEXT_IDS,
  UI_TEXT_LABELS,
  buildBeatTitleRows,
  buildUiMapFillRows,
  buildUiTextLabelRows,
  seedContentCompletionUiText,
} from '../src/services/content-completion-v1-ui-text-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Content Completion v1 — UI text seed', () => {
  it('proposes titles for all 18 real beats', () => {
    expect(Object.keys(BEAT_TITLE_TEXT_IDS)).toHaveLength(18);
    expect(buildBeatTitleRows()).toHaveLength(18 * 5);
  });

  it('proposes exactly the 40 wholly-missing text ids, five locales each', () => {
    expect(UI_TEXT_LABELS).toHaveLength(40);
    const rows = buildUiTextLabelRows();
    expect(rows).toHaveLength(40 * 5);
    expect(new Set(rows.map((r) => r.ui_text_row_id)).size).toBe(rows.length);
    for (const r of rows) expect(r.enabled).toBe('FALSE');
  });

  it('fills only the three missing ui_map locales, matching the live row id convention', () => {
    const rows = buildUiMapFillRows();
    expect(rows.map((r) => r.locale).sort()).toEqual(['el', 'fr', 'it']);
    expect(new Set(rows.map((r) => r.ui_text_row_id))).toEqual(
      new Set(['ui_map_it', 'ui_map_el', 'ui_map_fr']),
    );
    for (const r of rows) {
      expect(r.screen_id).toBe('global');
      expect(r.component_id).toBe('map_button');
    }
  });

  it('is idempotent and never touches an existing row (including live ui_map en/ar)', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    await gateway.appendRow('08_UI_TEXT', {
      ui_text_row_id: 'ui_map_en',
      text_id: 'ui_map',
      screen_id: 'global',
      component_id: 'map_button',
      locale: 'en',
      text: 'Map',
      direction: 'ltr',
      aria_label: 'Open map',
      enabled: 'TRUE',
      version: '1',
    });

    const first = await seedContentCompletionUiText(gateway);
    expect(first.created).toHaveLength(18 * 5 + 40 * 5 + 3);
    expect(first.existing).toEqual([]);

    const second = await seedContentCompletionUiText(gateway);
    expect(second.created).toEqual([]);

    const mapEn = await gateway.findByPrimaryKey('08_UI_TEXT', 'ui_map_en', { bypass: true });
    expect(mapEn?.row.raw.text).toBe('Map');
  });
});
