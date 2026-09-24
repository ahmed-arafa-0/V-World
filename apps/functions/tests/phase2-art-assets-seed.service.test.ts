import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  allPhase2Filenames,
  seedPhase2ArtAssets,
} from '../src/services/phase2-art-assets-seed.service.js';
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

async function sheetWithExistingKey(): Promise<SheetGateway> {
  const gateway = new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
  // A registered key icon that is still the old SVG placeholder, plus its icon row.
  await gateway.appendRow('10_ASSETS', {
    asset_id: 'asset_key_shell_icon',
    asset_type: 'svg',
    drive_file_id: '<DRIVE_FILE_ID>',
    enabled: 'TRUE',
    version: '1',
  });
  await gateway.appendRow('09_ICONS', {
    icon_id: 'key_shell_icon',
    category: 'key',
    display_name: 'Shell Key',
    asset_id: 'asset_key_shell_icon',
    format: 'svg',
    rtl_mirror: 'FALSE',
    width_px: '64',
    height_px: '64',
    enabled: 'TRUE',
    version: '1',
  });
  for (const id of ['ach_first_step', 'ach_perfect_quiz', 'ach_first_harvest', 'ach_secret_001']) {
    const existing = await gateway.findByPrimaryKey('23_ACHIEVEMENTS', id, { bypass: true });
    if (existing)
      await gateway.updateByPrimaryKey('23_ACHIEVEMENTS', id, { icon_id: '<ACH_ICON>' });
    else
      await gateway.appendRow('23_ACHIEVEMENTS', {
        achievement_id: id,
        category: 'story',
        icon_id: '<ACH_ICON>',
        secret: 'FALSE',
        points: '10',
        trigger_type: 'custom',
        trigger_rule_json: '{}',
        reward_quantity: '0',
        enabled: 'TRUE',
      });
  }
  return gateway;
}

describe('seedPhase2ArtAssets', () => {
  it('expects exactly the 61 uploaded files, all unique', () => {
    const names = allPhase2Filenames();
    expect(names).toHaveLength(61);
    expect(new Set(names).size).toBe(61);
  });

  it('registers new assets at version 1, bumps a changed existing key to version 2, and is idempotent', async () => {
    const gateway = await sheetWithExistingKey();
    const driveGateway = drive(allPhase2Filenames());

    const first = await seedPhase2ArtAssets(gateway, driveGateway, ROOT);
    expect(first.outcome.blocked).toEqual([]);
    const scene = await gateway.findByPrimaryKey('10_ASSETS', 'junction_scene', { bypass: true });
    expect(scene?.row.raw).toMatchObject({
      asset_type: 'image',
      drive_file_id: 'drive_junction_scene_desktop_v1.png',
      mobile_drive_file_id: 'drive_junction_scene_mobile_v1.png',
      version: '1',
    });
    const key = await gateway.findByPrimaryKey('10_ASSETS', 'asset_key_shell_icon', {
      bypass: true,
    });
    expect(key?.row.raw).toMatchObject({
      asset_type: 'image',
      drive_file_id: 'drive_key_shell_v1.png',
      version: '2',
    });
    const icon = await gateway.findByPrimaryKey('09_ICONS', 'key_shell_icon', { bypass: true });
    expect(icon?.row.raw).toMatchObject({ format: 'png', version: '2', alt_text_id: '' });

    const ach = await gateway.findByPrimaryKey('23_ACHIEVEMENTS', 'ach_first_step', {
      bypass: true,
    });
    expect(ach?.row.raw.icon_id).toBe('ach_first_step_icon');

    const second = await seedPhase2ArtAssets(gateway, driveGateway, ROOT);
    expect(second.outcome.created).toEqual([]);
    expect(second.outcome.updated).toEqual([]);
    expect(second.outcome.blocked).toEqual([]);
    const keyAgain = await gateway.findByPrimaryKey('10_ASSETS', 'asset_key_shell_icon', {
      bypass: true,
    });
    expect(keyAgain?.row.raw.version).toBe('2');
  });

  it('writes nothing for an asset whose file is missing, and rejects non-PNG files', async () => {
    const gateway = await sheetWithExistingKey();
    const names = allPhase2Filenames().filter((n) => n !== 'candle_lit_v1.png');
    const { outcome } = await seedPhase2ArtAssets(gateway, drive(names), ROOT);
    expect(outcome.blocked.map((b) => b.id)).toContain('candle_lit');
    expect(await gateway.findByPrimaryKey('10_ASSETS', 'candle_lit', { bypass: true })).toBeNull();

    const jpeg = await seedPhase2ArtAssets(
      await sheetWithExistingKey(),
      drive(allPhase2Filenames(), 'image/jpeg'),
      ROOT,
    );
    expect(jpeg.outcome.created).toEqual([]);
    expect(jpeg.outcome.blocked.length).toBeGreaterThan(0);
  });
});
