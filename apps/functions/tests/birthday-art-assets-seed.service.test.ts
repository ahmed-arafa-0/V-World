import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  allBirthdayFilenames,
  seedBirthdayArtAssets,
} from '../src/services/birthday-art-assets-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';

function drive(names: string[], mimeType = 'image/png'): DriveGateway {
  const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {};
  for (const name of names) {
    const id = `drive_${name}`;
    files[id] = {
      metadata: fakeMetadata({ id, name, parents: [ROOT], mimeType, size: 100 }),
      content: Buffer.alloc(0),
    };
  }
  return new DriveGateway(new FakeGoogleDriveClient(files));
}

async function sheetWithAchievementPlaceholder(): Promise<SheetGateway> {
  const gateway = new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
  const existing = await gateway.findByPrimaryKey('23_ACHIEVEMENTS', 'birthday_2026_celebrated', {
    bypass: true,
  });
  if (existing) {
    await gateway.updateByPrimaryKey('23_ACHIEVEMENTS', 'birthday_2026_celebrated', {
      icon_id: '<ACH_ICON>',
    });
  } else {
    await gateway.appendRow('23_ACHIEVEMENTS', {
      achievement_id: 'birthday_2026_celebrated',
      category: 'birthday',
      icon_id: '<ACH_ICON>',
      secret: 'TRUE',
      points: '10',
      trigger_type: 'birthday_gift_claim',
      trigger_rule_json: '{}',
      reward_key_type_id: '',
      reward_quantity: '0',
      enabled: 'TRUE',
    });
  }
  return gateway;
}

describe('seedBirthdayArtAssets', () => {
  it('expects exactly the 7 supplied filenames, all unique', () => {
    const names = allBirthdayFilenames();
    expect(names).toHaveLength(7); // 5 assets (garden's desktop + mobile count as 2 files) + 1 icon file
    expect(new Set(names).size).toBe(7);
    expect(names).toEqual(
      expect.arrayContaining([
        'birthday_garden_desktop_v1.png',
        'birthday_garden_mobile_v1.png',
        'birthday_cake_base_v2.png',
        'birthday_sunflower_decoration_v1.png',
        'birthday_candle_unlit_v1.png',
        'birthday_candle_flame_v1.png',
      ]),
    );
  });

  it('registers the garden as one scene asset with a mobile variant, at version 1, and a rerun is a no-op', async () => {
    const gateway = await sheetWithAchievementPlaceholder();
    const driveGateway = drive([...allBirthdayFilenames(), 'birthday_achievement_badge_v1.png']);

    const first = await seedBirthdayArtAssets(gateway, driveGateway, ROOT);
    expect(first.outcome.blocked).toEqual([]);
    const garden = await gateway.findByPrimaryKey('10_ASSETS', 'birthday_garden', { bypass: true });
    expect(garden?.row.raw).toMatchObject({
      asset_type: 'image',
      drive_file_id: 'drive_birthday_garden_desktop_v1.png',
      mobile_drive_file_id: 'drive_birthday_garden_mobile_v1.png',
      version: '1',
    });
    const cake = await gateway.findByPrimaryKey('10_ASSETS', 'birthday_cake', { bypass: true });
    expect(cake?.row.raw).toMatchObject({
      drive_file_id: 'drive_birthday_cake_base_v2.png',
      version: '1',
    });
    const icon = await gateway.findByPrimaryKey('09_ICONS', 'birthday_2026_celebrated_icon', {
      bypass: true,
    });
    expect(icon?.row.raw).toMatchObject({ category: 'achievement', format: 'png', version: '1' });
    const ach = await gateway.findByPrimaryKey('23_ACHIEVEMENTS', 'birthday_2026_celebrated', {
      bypass: true,
    });
    expect(ach?.row.raw.icon_id).toBe('birthday_2026_celebrated_icon');

    const second = await seedBirthdayArtAssets(gateway, driveGateway, ROOT);
    expect(second.outcome.created).toEqual([]);
    expect(second.outcome.updated).toEqual([]);
    expect(second.outcome.blocked).toEqual([]);
  });

  it('blocks a missing file without touching already-registered, unrelated assets', async () => {
    const gateway = await sheetWithAchievementPlaceholder();
    const allFiles = [...allBirthdayFilenames(), 'birthday_achievement_badge_v1.png'];
    await seedBirthdayArtAssets(gateway, drive(allFiles), ROOT);

    const missingDrive = drive(allFiles.filter((f) => f !== 'birthday_candle_flame_v1.png'));
    const { outcome } = await seedBirthdayArtAssets(gateway, missingDrive, ROOT);
    expect(outcome.blocked.map((b) => b.id)).toContain('birthday_candle_flame');
    // Unrelated assets already registered stay unchanged, never touched by the one blocked asset.
    expect(outcome.unchanged).toEqual(
      expect.arrayContaining([
        '10_ASSETS.birthday_garden',
        '10_ASSETS.birthday_cake',
        '10_ASSETS.birthday_cottage_decoration',
      ]),
    );
  });

  it('rejects a non-PNG match and writes nothing for it', async () => {
    const gateway = await sheetWithAchievementPlaceholder();
    const allFiles = [...allBirthdayFilenames(), 'birthday_achievement_badge_v1.png'];
    const { outcome } = await seedBirthdayArtAssets(gateway, drive(allFiles, 'image/jpeg'), ROOT);
    expect(outcome.created).toEqual([]);
    expect(outcome.blocked.length).toBeGreaterThan(0);
  });
});
