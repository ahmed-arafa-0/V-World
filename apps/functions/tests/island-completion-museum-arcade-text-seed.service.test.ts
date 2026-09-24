import { describe, expect, it } from 'vitest';
import { seedContentCompletionUiText } from '../src/services/content-completion-v1-ui-text-seed.service.js';
import {
  activateMuseumArcadeText,
  seedMuseumWingText,
} from '../src/services/island-completion-museum-arcade-text-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

describe('Island completion — Museum/Arcade text', () => {
  it('reports every activation target missing before the drafted rows have been seeded', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const outcome = await activateMuseumArcadeText(gateway);
    expect(outcome.updated).toEqual([]);
    expect(outcome.missing).toHaveLength(50); // 10 text ids x 5 locales
  });

  it('activates exactly the drafted rows, once, and is idempotent on a rerun', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    await seedContentCompletionUiText(gateway);

    const first = await activateMuseumArcadeText(gateway);
    expect(first.updated).toHaveLength(50);
    expect(first.missing).toEqual([]);

    const row = await gateway.findByPrimaryKey('08_UI_TEXT', 'ui_exhibit_comic_name_en', {
      bypass: true,
    });
    expect(row?.row.values.enabled).toBe(true);
    expect(row?.row.raw.text).toBe('A Story in Pictures');

    const second = await activateMuseumArcadeText(gateway);
    expect(second.updated).toEqual([]);
    expect(second.missing).toEqual([]);
  });

  it('adds the three wing display names in all five languages, and is idempotent', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    const first = await seedMuseumWingText(gateway);
    expect(first.created).toHaveLength(15); // 3 wings x 5 locales

    const archiveEn = await gateway.findByPrimaryKey('08_UI_TEXT', 'ui_museum_archive_wing_en', {
      bypass: true,
    });
    expect(archiveEn?.row.raw.text).toBe('The Archive');
    expect(archiveEn?.row.values.enabled).toBe(true);

    const archiveAr = await gateway.findByPrimaryKey('08_UI_TEXT', 'ui_museum_archive_wing_ar', {
      bypass: true,
    });
    expect(archiveAr?.row.raw.direction).toBe('rtl');

    const second = await seedMuseumWingText(gateway);
    expect(second.created).toEqual([]);
    expect(second.existing).toHaveLength(15);
  });
});
