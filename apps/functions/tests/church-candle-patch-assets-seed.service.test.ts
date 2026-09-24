import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  CHURCH_CANDLE_PATCH_SPECS,
  allChurchCandlePatchFilenames,
  seedChurchCandlePatchAssets,
} from '../src/services/church-candle-patch-assets-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';

function drive(
  names: string[],
  overrides: Record<string, Partial<ReturnType<typeof fakeMetadata>>> = {},
): DriveGateway {
  const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {};
  for (const name of names) {
    const id = `drive_${name}`;
    files[id] = {
      metadata: fakeMetadata({
        id,
        name,
        parents: [ROOT],
        mimeType: 'image/png',
        size: 100,
        ...overrides[name],
      }),
      content: Buffer.alloc(0),
    };
  }
  return new DriveGateway(new FakeGoogleDriveClient(files));
}

function sheetGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('seedChurchCandlePatchAssets', () => {
  it('expects exactly 4 distinct filenames', () => {
    const names = allChurchCandlePatchFilenames();
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
  });

  it('reports both files blocked (missing) when nothing has been uploaded yet, and writes nothing', async () => {
    const gateway = sheetGateway();
    const before = await gateway.getRawTab('10_ASSETS', { bypass: true });
    const { outcome, discovery } = await seedChurchCandlePatchAssets(gateway, drive([]), ROOT);
    expect(discovery.found.size).toBe(0);
    expect(outcome.blocked.map((b) => b.assetId).sort()).toEqual(
      ['church_candle_corner_scene', 'church_interior_scene'].sort(),
    );
    expect(outcome.created).toEqual([]);
    expect(outcome.updated).toEqual([]);
    const after = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(after).toEqual(before);
  });

  it('registers church_candle_corner_scene as new at version 1 and bumps the existing church_interior_scene by one', async () => {
    const gateway = sheetGateway();
    // An existing church_interior_scene row, as Phase 2 already registered it.
    await gateway.appendRow('10_ASSETS', {
      asset_id: 'church_interior_scene',
      asset_type: 'image',
      location_id: 'church',
      drive_file_id: 'old_desktop_id',
      mobile_drive_file_id: 'old_mobile_id',
      enabled: 'TRUE',
      version: '3',
    });
    const driveGateway = drive(allChurchCandlePatchFilenames());

    const { outcome } = await seedChurchCandlePatchAssets(gateway, driveGateway, ROOT);
    expect(outcome.blocked).toEqual([]);
    expect(outcome.created).toEqual(['church_candle_corner_scene']);
    expect(outcome.updated).toEqual([{ assetId: 'church_interior_scene', version: '4' }]);

    const corner = await gateway.findByPrimaryKey('10_ASSETS', 'church_candle_corner_scene', {
      bypass: true,
    });
    expect(corner!.row.raw).toMatchObject({
      asset_type: 'image',
      location_id: 'church',
      drive_file_id: 'drive_church_candle_corner_scene_desktop_v1.png',
      mobile_drive_file_id: 'drive_church_candle_corner_scene_mobile_v1.png',
      version: '1',
      enabled: 'TRUE',
    });

    const interior = await gateway.findByPrimaryKey('10_ASSETS', 'church_interior_scene', {
      bypass: true,
    });
    expect(interior!.row.raw).toMatchObject({
      drive_file_id: 'drive_church_interior_scene_desktop_v2.png',
      mobile_drive_file_id: 'drive_church_interior_scene_mobile_v2.png',
      version: '4',
      // Unrelated existing columns are untouched.
      location_id: 'church',
      enabled: 'TRUE',
    });
  });

  it('never touches the unrelated, older "church_candle_corner" (no "_scene") row from the original art pack', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('10_ASSETS', {
      asset_id: 'church_candle_corner',
      asset_type: 'image',
      drive_file_id: 'unrelated_old_id',
      enabled: 'FALSE',
      version: '1',
      notes: 'proposed_optional, never adopted',
    });
    const driveGateway = drive(allChurchCandlePatchFilenames());
    await seedChurchCandlePatchAssets(gateway, driveGateway, ROOT);

    const old = await gateway.findByPrimaryKey('10_ASSETS', 'church_candle_corner', {
      bypass: true,
    });
    expect(old!.row.raw.drive_file_id).toBe('unrelated_old_id');
    expect(old!.row.raw.version).toBe('1');
  });

  it('is idempotent: rerunning with the same Drive files changes nothing further', async () => {
    const gateway = sheetGateway();
    const driveGateway = drive(allChurchCandlePatchFilenames());
    await seedChurchCandlePatchAssets(gateway, driveGateway, ROOT);
    const afterFirst = await gateway.getRawTab('10_ASSETS', { bypass: true });

    const { outcome } = await seedChurchCandlePatchAssets(gateway, driveGateway, ROOT);
    expect(outcome.created).toEqual([]);
    expect(outcome.updated).toEqual([]);
    expect(outcome.unchanged.sort()).toEqual(
      ['church_candle_corner_scene', 'church_interior_scene'].sort(),
    );
    const afterSecond = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(afterSecond).toEqual(afterFirst);
  });

  it('rejects a non-PNG MIME type for a same-named file and leaves that one asset blocked', async () => {
    const gateway = sheetGateway();
    const badFile = 'church_interior_scene_desktop_v2.png';
    const driveGateway = drive(allChurchCandlePatchFilenames(), {
      [badFile]: { mimeType: 'application/pdf' },
    });
    const { outcome, discovery } = await seedChurchCandlePatchAssets(gateway, driveGateway, ROOT);
    expect(discovery.issues).toContainEqual(
      expect.objectContaining({ filename: badFile, issue: 'unsupported_mime' }),
    );
    expect(outcome.blocked.map((b) => b.assetId)).toEqual(['church_interior_scene']);
    // The unaffected asset still registers normally.
    expect(outcome.created).toEqual(['church_candle_corner_scene']);
  });

  it('reports ambiguous when more than one Drive file shares the exact filename under the root', async () => {
    const gateway = sheetGateway();
    const names = allChurchCandlePatchFilenames();
    const dupName = names[0]!;
    const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> =
      {};
    for (const name of names) {
      files[`drive_${name}`] = {
        metadata: fakeMetadata({
          id: `drive_${name}`,
          name,
          parents: [ROOT],
          mimeType: 'image/png',
        }),
        content: Buffer.alloc(0),
      };
    }
    files[`drive_${dupName}_dup`] = {
      metadata: fakeMetadata({
        id: `drive_${dupName}_dup`,
        name: dupName,
        parents: [ROOT],
        mimeType: 'image/png',
      }),
      content: Buffer.alloc(0),
    };
    const driveGatewayDup = new DriveGateway(new FakeGoogleDriveClient(files));
    const { discovery } = await seedChurchCandlePatchAssets(gateway, driveGatewayDup, ROOT);
    expect(discovery.issues).toContainEqual(
      expect.objectContaining({ filename: dupName, issue: 'ambiguous' }),
    );
  });

  it('preserves every pre-existing 10_ASSETS row untouched', async () => {
    const gateway = sheetGateway();
    const before = await gateway.getRawTab('10_ASSETS', { bypass: true });
    await seedChurchCandlePatchAssets(gateway, drive(allChurchCandlePatchFilenames()), ROOT);
    const after = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('never reads or writes 02_USERS (Gate code / Admin password are untouched)', async () => {
    const gateway = sheetGateway();
    const usersBefore = await gateway.getRawTab('02_USERS', { bypass: true });
    await seedChurchCandlePatchAssets(gateway, drive(allChurchCandlePatchFilenames()), ROOT);
    const usersAfter = await gateway.getRawTab('02_USERS', { bypass: true });
    expect(usersAfter).toEqual(usersBefore);
  });

  it('lists exactly the two spec asset ids', () => {
    expect(CHURCH_CANDLE_PATCH_SPECS.map((s) => s.assetId).sort()).toEqual(
      ['church_candle_corner_scene', 'church_interior_scene'].sort(),
    );
  });
});
