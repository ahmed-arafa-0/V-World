import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  SCENE_ICON_SEED_SPECS,
  seedPhase1SceneIcons,
} from '../src/services/phase1-scene-icons-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';

function drive(names: string[], mimeType = 'image/svg+xml'): DriveGateway {
  const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {};
  for (const name of names) {
    const id = `drive_${name}`;
    files[id] = {
      metadata: fakeMetadata({ id, name, parents: [ROOT], mimeType, size: 120 }),
      content: Buffer.alloc(0),
    };
  }
  return new DriveGateway(new FakeGoogleDriveClient(files));
}
const allNames = SCENE_ICON_SEED_SPECS.map((s) => s.filename);

function sheet(): SheetGateway {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  return new SheetGateway(client, { ttlSeconds: 60 });
}

describe('seedPhase1SceneIcons', () => {
  it('covers exactly the six requested icon ids, each with its own asset id', () => {
    expect(SCENE_ICON_SEED_SPECS.map((s) => s.iconId)).toEqual([
      'icon_walk_forward',
      'icon_walk_back',
      'icon_look_left',
      'icon_look_right',
      'icon_interact',
      'icon_settings',
    ]);
    expect(new Set(SCENE_ICON_SEED_SPECS.map((s) => s.assetId)).size).toBe(6);
  });

  it('writes nothing and reports BLOCKED when the SVGs are not in Drive', async () => {
    const gateway = sheet();
    const outcome = await seedPhase1SceneIcons(gateway, drive([]), ROOT);
    expect(outcome.created).toHaveLength(0);
    expect(outcome.blocked).toHaveLength(6);
    expect(
      await gateway.findByPrimaryKey('09_ICONS', 'icon_settings', { bypass: true }),
    ).toBeNull();
    expect(
      await gateway.findByPrimaryKey('10_ASSETS', 'asset_icon_settings', { bypass: true }),
    ).toBeNull();
  });

  it('blocks a file that is not an SVG', async () => {
    const outcome = await seedPhase1SceneIcons(sheet(), drive(allNames, 'image/png'), ROOT);
    expect(outcome.blocked).toHaveLength(6);
    expect(outcome.created).toHaveLength(0);
  });

  it('creates validated asset (type image) + icon rows, and is idempotent on rerun', async () => {
    const gateway = sheet();
    const driveGateway = drive(allNames);
    const first = await seedPhase1SceneIcons(gateway, driveGateway, ROOT);
    expect(first.created).toHaveLength(6);
    const icon = await gateway.findByPrimaryKey('09_ICONS', 'icon_look_left', { bypass: true });
    expect(icon?.row.raw).toMatchObject({
      asset_id: 'asset_icon_look_left',
      format: 'svg',
      rtl_mirror: 'FALSE',
      alt_text_id: 'player_lookLeft',
      enabled: 'TRUE',
    });
    const asset = await gateway.findByPrimaryKey('10_ASSETS', 'asset_icon_look_left', {
      bypass: true,
    });
    expect(asset?.row.raw).toMatchObject({
      asset_type: 'image',
      drive_file_id: 'drive_icon_look_left.svg',
    });

    const second = await seedPhase1SceneIcons(gateway, driveGateway, ROOT);
    expect(second.created).toHaveLength(0);
    expect(second.unchanged).toHaveLength(6);
    expect(second.conflicts).toHaveLength(0);
  });

  it('never modifies an existing row; a differing one is reported as a conflict', async () => {
    const gateway = sheet();
    await gateway.appendRow('09_ICONS', {
      icon_id: 'icon_settings',
      category: 'ui',
      display_name: 'Hand edited',
      asset_id: 'asset_something_else',
      format: 'svg',
      rtl_mirror: 'FALSE',
      alt_text_id: 'x',
      width_px: '48',
      height_px: '48',
      enabled: 'TRUE',
      version: '7',
    });
    const outcome = await seedPhase1SceneIcons(gateway, drive(allNames), ROOT);
    expect(outcome.conflicts).toContainEqual({
      tab: '09_ICONS',
      id: 'icon_settings',
      columns: ['asset_id'],
    });
    const after = await gateway.findByPrimaryKey('09_ICONS', 'icon_settings', { bypass: true });
    expect(after?.row.raw.display_name).toBe('Hand edited');
    expect(after?.row.raw.version).toBe('7');
  });
});
