import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  discoverChurchStoryImageFiles,
  seedChurchStoryImages,
  type ChurchStoryImageSpec,
} from '../src/services/church-story-image-seed.service.js';
import { DriveGateway } from '../src/repositories/drive-gateway.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { fakeMetadata, FakeGoogleDriveClient } from './helpers/fake-drive-client.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const ROOT = 'root_folder';

const SPECS: ChurchStoryImageSpec[] = [
  {
    assetId: 'church_story_storm_001_image',
    storyId: 'church_story_storm_001',
    filename: 'church_story_storm_001_image_v1.png',
    mimeType: 'image/png',
  },
  {
    assetId: 'church_story_creation_001_image',
    storyId: 'church_story_creation_001',
    filename: 'church_story_creation_001_image_v1.png',
    mimeType: 'image/png',
  },
];

function drive(filenames: string[], mimeType = 'image/png'): DriveGateway {
  const files: Record<string, { metadata: ReturnType<typeof fakeMetadata>; content: Buffer }> = {};
  for (const name of filenames) {
    const id = `drive_${name}`;
    files[id] = {
      metadata: fakeMetadata({ id, name, parents: [ROOT], mimeType, size: 100 }),
      content: Buffer.alloc(0),
    };
  }
  return new DriveGateway(new FakeGoogleDriveClient(files));
}

/** A 5-locale preserved story (`storm`) and a 1-locale new story (`creation`), matching the real shape. */
async function sheetWithStories(): Promise<SheetGateway> {
  const gateway = new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
  for (const suffix of ['en', 'ar-EG', 'it', 'el', 'fr']) {
    await gateway.appendRow('30_CHURCH_CONTENT', {
      content_row_id: `church_story_storm_001_${suffix === 'ar-EG' ? 'ar' : suffix}`,
      content_id: 'church_story_storm_001',
      content_type: 'story',
      active_date: '2026-09-23',
      locale: suffix,
      title: 'The Storm',
      text: 'Text',
      direction: suffix === 'ar-EG' ? 'rtl' : 'ltr',
      image_asset_ids: '',
      voiceover_id: '',
      bible_reference: 'Mark 4',
      source_url: '',
      review_status: 'approved',
      enabled: 'TRUE',
    });
  }
  await gateway.appendRow('30_CHURCH_CONTENT', {
    content_row_id: 'church_story_creation_001_ar',
    content_id: 'church_story_creation_001',
    content_type: 'story',
    active_date: '2026-09-24',
    locale: 'ar-EG',
    title: 'Creation',
    text: 'Text',
    direction: 'rtl',
    image_asset_ids: '',
    voiceover_id: '',
    bible_reference: 'Genesis 1',
    source_url: '',
    review_status: 'approved',
    enabled: 'TRUE',
  });
  return gateway;
}

describe('seedChurchStoryImages', () => {
  it('registers a new image asset per spec and links every locale row sharing the content_id', async () => {
    const gateway = await sheetWithStories();
    const { discovery, outcome } = await seedChurchStoryImages(
      gateway,
      drive(SPECS.map((s) => s.filename)),
      ROOT,
      SPECS,
    );
    expect(discovery.issues).toEqual([]);
    expect(outcome.created).toEqual(SPECS.map((s) => s.assetId));
    expect(outcome.blocked).toEqual([]);

    const asset = await gateway.findByPrimaryKey('10_ASSETS', 'church_story_storm_001_image', {
      bypass: true,
    });
    expect(asset?.row.raw).toMatchObject({
      asset_type: 'image',
      location_id: 'church',
      drive_file_id: 'drive_church_story_storm_001_image_v1.png',
      enabled: 'TRUE',
      version: '1',
    });

    // All 5 locale rows of the preserved story got linked, not just one.
    for (const suffix of ['en', 'ar', 'it', 'el', 'fr']) {
      const row = await gateway.findByPrimaryKey(
        '30_CHURCH_CONTENT',
        `church_story_storm_001_${suffix}`,
        { bypass: true },
      );
      expect(row?.row.raw.image_asset_ids).toBe('church_story_storm_001_image');
    }
    const single = await gateway.findByPrimaryKey(
      '30_CHURCH_CONTENT',
      'church_story_creation_001_ar',
      {
        bypass: true,
      },
    );
    expect(single?.row.raw.image_asset_ids).toBe('church_story_creation_001_image');
  });

  it('is idempotent, and never overwrites an image_asset_ids cell someone already set by hand', async () => {
    const gateway = await sheetWithStories();
    await gateway.updateByPrimaryKey('30_CHURCH_CONTENT', 'church_story_storm_001_en', {
      image_asset_ids: 'some_hand_set_asset',
    });

    const first = await seedChurchStoryImages(
      gateway,
      drive(SPECS.map((s) => s.filename)),
      ROOT,
      SPECS,
    );
    expect(first.outcome.created).toEqual(SPECS.map((s) => s.assetId));
    const handSet = await gateway.findByPrimaryKey(
      '30_CHURCH_CONTENT',
      'church_story_storm_001_en',
      {
        bypass: true,
      },
    );
    expect(handSet?.row.raw.image_asset_ids).toBe('some_hand_set_asset');

    const second = await seedChurchStoryImages(
      gateway,
      drive(SPECS.map((s) => s.filename)),
      ROOT,
      SPECS,
    );
    expect(second.outcome.created).toEqual([]);
    expect(second.outcome.unchanged).toEqual(SPECS.map((s) => s.assetId));
    expect(second.outcome.linked).toEqual([]);
  });

  it('reports a missing file as blocked, without writing any row for it', async () => {
    const gateway = await sheetWithStories();
    const names = SPECS.map((s) => s.filename).filter(
      (f) => f !== 'church_story_creation_001_image_v1.png',
    );
    const { outcome } = await seedChurchStoryImages(gateway, drive(names), ROOT, SPECS);
    expect(outcome.blocked.map((b) => b.assetId)).toEqual(['church_story_creation_001_image']);
    expect(
      await gateway.findByPrimaryKey('10_ASSETS', 'church_story_creation_001_image', {
        bypass: true,
      }),
    ).toBeNull();
    expect(outcome.created).toEqual(['church_story_storm_001_image']);
  });

  it('rejects a non-image MIME type as unsupported', async () => {
    const files = drive(
      SPECS.map((s) => s.filename),
      'application/pdf',
    );
    const { issues } = await discoverChurchStoryImageFiles(files, ROOT, SPECS);
    expect(issues.every((i) => i.issue === 'unsupported_mime')).toBe(true);
  });
});
