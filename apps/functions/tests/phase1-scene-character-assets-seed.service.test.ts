import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  SCENE_CHARACTER_ASSET_SEED_ROWS,
  discoverPhase1SceneAssetFiles,
  seedPhase1SceneCharacterAssets,
} from '../src/services/phase1-scene-character-assets-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';

/** Builds a fake Drive with exactly the 16 real filenames present under the root, each with a unique fake file id. */
function fullDriveClient(): FakeGoogleDriveClient {
  const allFilenames = Array.from(
    new Set(
      SCENE_CHARACTER_ASSET_SEED_ROWS.flatMap((s) =>
        [s.desktopFile, s.mobileFile, s.singleFile].filter((f): f is string => Boolean(f)),
      ),
    ),
  );
  const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {};
  for (const name of allFilenames) {
    const id = `drive_${name}`;
    files[id] = {
      metadata: fakeMetadata({ id, name, parents: [ROOT], mimeType: 'image/png', size: 1024 }),
      content: Buffer.alloc(0),
    };
  }
  return new FakeGoogleDriveClient(files);
}

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

describe('discoverPhase1SceneAssetFiles', () => {
  it('finds every file when all 16 real filenames are present under the root', async () => {
    const driveGateway = new DriveGateway(fullDriveClient());
    const { found, issues } = await discoverPhase1SceneAssetFiles(driveGateway, ROOT);
    expect(issues).toHaveLength(0);
    expect(found.size).toBe(16);
  });

  it('reports a missing filename as an issue, not a thrown error', async () => {
    const client = fullDriveClient();
    // Remove one file the specs require.
    // @ts-expect-error -- reaching into the fake's private map for test setup only.
    delete client.files['drive_gate_closed_desktop_v1.png'];
    const driveGateway = new DriveGateway(client);
    const { found, issues } = await discoverPhase1SceneAssetFiles(driveGateway, ROOT);
    expect(found.has('gate_closed_desktop_v1.png')).toBe(false);
    expect(issues).toContainEqual({ filename: 'gate_closed_desktop_v1.png', issue: 'missing' });
  });

  it('reports an ambiguous filename (two matches under the root) as an issue', async () => {
    const client = fullDriveClient();
    // @ts-expect-error -- reaching into the fake's private map for test setup only.
    client.files['drive_gate_closed_desktop_v1_dup'] = {
      metadata: fakeMetadata({
        id: 'drive_gate_closed_desktop_v1_dup',
        name: 'gate_closed_desktop_v1.png',
        parents: [ROOT],
        mimeType: 'image/png',
        size: 999,
      }),
      content: Buffer.alloc(0),
    };
    const driveGateway = new DriveGateway(client);
    const { found, issues } = await discoverPhase1SceneAssetFiles(driveGateway, ROOT);
    expect(found.has('gate_closed_desktop_v1.png')).toBe(false);
    expect(issues.find((i) => i.filename === 'gate_closed_desktop_v1.png')?.issue).toBe(
      'ambiguous',
    );
  });

  it('rejects an unsupported MIME type rather than registering it', async () => {
    const client = fullDriveClient();
    // @ts-expect-error -- reaching into the fake's private map for test setup only.
    client.files['drive_gate_closed_desktop_v1.png'].metadata.mimeType = 'application/zip';
    const driveGateway = new DriveGateway(client);
    const { found, issues } = await discoverPhase1SceneAssetFiles(driveGateway, ROOT);
    expect(found.has('gate_closed_desktop_v1.png')).toBe(false);
    expect(issues.find((i) => i.filename === 'gate_closed_desktop_v1.png')?.issue).toBe(
      'unsupported_mime',
    );
  });

  it('never returns a raw file outside the configured root as a match', async () => {
    const client = new FakeGoogleDriveClient({
      outside: {
        metadata: fakeMetadata({
          id: 'outside',
          name: 'gate_closed_desktop_v1.png',
          parents: ['some_other_folder'],
          mimeType: 'image/png',
          size: 10,
        }),
        content: Buffer.alloc(0),
      },
    });
    const driveGateway = new DriveGateway(client);
    const { found, issues } = await discoverPhase1SceneAssetFiles(driveGateway, ROOT);
    expect(found.has('gate_closed_desktop_v1.png')).toBe(false);
    expect(issues.find((i) => i.filename === 'gate_closed_desktop_v1.png')?.issue).toBe('missing');
  });
});

describe('seedPhase1SceneCharacterAssets', () => {
  it('registers all 10 asset rows when all 16 files are discoverable', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const driveGateway = new DriveGateway(fullDriveClient());
    const { outcome } = await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    expect(outcome.blocked).toHaveLength(0);
    expect(outcome.created).toHaveLength(SCENE_CHARACTER_ASSET_SEED_ROWS.length);
  });

  it('registers a desktop+mobile pair asset with both drive_file_id and mobile_drive_file_id set', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const driveGateway = new DriveGateway(fullDriveClient());
    await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    const found = await gateway.findByPrimaryKey('10_ASSETS', 'beach_focus_scene', {
      bypass: true,
    });
    expect(found).not.toBeNull();
    expect(found!.row.raw.drive_file_id).toBe('drive_beach_focus_desktop_v1.png');
    expect(found!.row.raw.mobile_drive_file_id).toBe('drive_beach_focus_mobile_v1.png');
    expect(found!.row.raw.location_id).toBe('beach');
    expect(found!.row.raw.enabled).toBe('TRUE');
  });

  it('registers a single-file character asset with no mobile_drive_file_id', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const driveGateway = new DriveGateway(fullDriveClient());
    await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    const found = await gateway.findByPrimaryKey('10_ASSETS', 'var_idle_no_collar', {
      bypass: true,
    });
    expect(found).not.toBeNull();
    expect(found!.row.raw.drive_file_id).toBe('drive_cat_idle_no_collar_v1.png');
    expect(found!.row.raw.mobile_drive_file_id).toBe('');
  });

  it('blocks only the affected asset when one of its required files is missing, and still registers everything else', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const client = fullDriveClient();
    // @ts-expect-error -- reaching into the fake's private map for test setup only.
    delete client.files['drive_church_focus_mobile_v1.png'];
    const driveGateway = new DriveGateway(client);

    const { outcome } = await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    expect(outcome.blocked).toEqual([
      {
        assetId: 'church_focus_scene',
        reasons: ['church_focus_mobile_v1.png: missing'],
      },
    ]);
    expect(outcome.created).toHaveLength(SCENE_CHARACTER_ASSET_SEED_ROWS.length - 1);
    const blocked = await gateway.findByPrimaryKey('10_ASSETS', 'church_focus_scene', {
      bypass: true,
    });
    expect(blocked).toBeNull();
  });

  it('is idempotent: rerunning creates nothing new and reports everything unchanged', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const driveGateway = new DriveGateway(fullDriveClient());
    await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    const { outcome } = await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);
    expect(outcome.created).toHaveLength(0);
    expect(outcome.updated).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(SCENE_CHARACTER_ASSET_SEED_ROWS.length);
  });

  it('preserves every pre-existing 10_ASSETS row untouched', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.getRawTab('10_ASSETS', { bypass: true });
    const driveGateway = new DriveGateway(fullDriveClient());

    await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    const after = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('never reads or writes 02_USERS (Gate code / Admin password are untouched)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const usersBefore = await gateway.getRawTab('02_USERS', { bypass: true });
    const driveGateway = new DriveGateway(fullDriveClient());

    await seedPhase1SceneCharacterAssets(gateway, driveGateway, ROOT);

    const usersAfter = await gateway.getRawTab('02_USERS', { bypass: true });
    expect(usersAfter).toEqual(usersBefore);
  });
});
