import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { COMIC_ASSET_ID, seedComicSource } from '../src/services/comic-source-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';
const FILE_ID = '1B7VxmnWGKpiY9nyzS9TK9VU9spvxE7U0';

function drive(overrides: Partial<ReturnType<typeof fakeMetadata>> = {}): DriveGateway {
  const metadata = fakeMetadata({
    id: FILE_ID,
    name: 'veoulla_comic.pdf',
    parents: [ROOT],
    mimeType: 'application/pdf',
    size: 1000,
    ...overrides,
  });
  return new DriveGateway(
    new FakeGoogleDriveClient({ [FILE_ID]: { metadata, content: Buffer.alloc(0) } }),
  );
}

function sheetGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('seedComicSource', () => {
  it('creates comic_pdf_2025 at version 1 when the verified PDF is new', async () => {
    const gateway = sheetGateway();
    const outcome = await seedComicSource(gateway, drive(), ROOT, FILE_ID);
    expect(outcome.kind).toBe('created');
    const row = await gateway.findByPrimaryKey('10_ASSETS', COMIC_ASSET_ID, { bypass: true });
    expect(row!.row.raw).toMatchObject({
      asset_type: 'pdf',
      drive_file_id: FILE_ID,
      version: '1',
      enabled: 'TRUE',
    });
  });

  it('is idempotent: rerunning with the same verified file changes nothing further', async () => {
    const gateway = sheetGateway();
    const driveGateway = drive();
    await seedComicSource(gateway, driveGateway, ROOT, FILE_ID);
    const afterFirst = await gateway.getRawTab('10_ASSETS', { bypass: true });

    const outcome = await seedComicSource(gateway, driveGateway, ROOT, FILE_ID);
    expect(outcome.kind).toBe('unchanged');
    const afterSecond = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(afterSecond).toEqual(afterFirst);
  });

  it('bumps the version and updates drive_file_id when an existing row points at a different file', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('10_ASSETS', {
      asset_id: COMIC_ASSET_ID,
      asset_type: 'pdf',
      location_id: 'museum',
      drive_file_id: 'old_placeholder_id',
      enabled: 'TRUE',
      version: '1',
    });
    const outcome = await seedComicSource(gateway, drive(), ROOT, FILE_ID);
    expect(outcome.kind).toBe('updated');
    if (outcome.kind === 'updated') expect(outcome.version).toBe('2');
    const row = await gateway.findByPrimaryKey('10_ASSETS', COMIC_ASSET_ID, { bypass: true });
    expect(row!.row.raw.drive_file_id).toBe(FILE_ID);
  });

  it('blocks and writes nothing when the file is trashed', async () => {
    const gateway = sheetGateway();
    const before = await gateway.getRawTab('10_ASSETS', { bypass: true });
    const outcome = await seedComicSource(gateway, drive({ trashed: true }), ROOT, FILE_ID);
    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') expect(outcome.reasons).toContain('file is trashed');
    const after = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(after).toEqual(before);
  });

  it('blocks a non-PDF mime type and writes nothing', async () => {
    const gateway = sheetGateway();
    const outcome = await seedComicSource(gateway, drive({ mimeType: 'image/png' }), ROOT, FILE_ID);
    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') {
      expect(outcome.reasons.some((r) => r.includes('unsupported mime type'))).toBe(true);
    }
  });

  it('blocks a file that is not under the configured Drive asset root', async () => {
    const gateway = sheetGateway();
    const outcome = await seedComicSource(
      gateway,
      drive({ parents: ['some_other_folder'] }),
      ROOT,
      FILE_ID,
    );
    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') {
      expect(outcome.reasons).toContain('file is outside the configured Drive asset root');
    }
  });

  it('never touches unrelated 10_ASSETS rows or 02_USERS', async () => {
    const gateway = sheetGateway();
    const usersBefore = await gateway.getRawTab('02_USERS', { bypass: true });
    await seedComicSource(gateway, drive(), ROOT, FILE_ID);
    const usersAfter = await gateway.getRawTab('02_USERS', { bypass: true });
    expect(usersAfter).toEqual(usersBefore);
  });
});
