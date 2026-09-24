import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { ARCHIVE_EXHIBIT_ID, seedArchiveSite } from '../src/services/archive-site-seed.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const URL_OK = 'https://varcountdown.web.app/';

function sheetGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('seedArchiveSite', () => {
  it('reports exhibit_not_found and writes nothing when exhibit_old_site does not exist yet', async () => {
    const gateway = sheetGateway();
    const before = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });
    const outcome = await seedArchiveSite(gateway, URL_OK);
    expect(outcome.kind).toBe('exhibit_not_found');
    const after = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });
    expect(after).toEqual(before);
  });

  it('sets source_content_id when the exhibit exists with a blank field', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('34_MUSEUM_EXHIBITS', {
      exhibit_id: ARCHIVE_EXHIBIT_ID,
      wing_id: 'archive_wing',
      exhibit_type: 'archive_portal',
      unlock_type: 'story_progress',
      position_id: 'archive_01',
      enabled: 'TRUE',
    });
    const outcome = await seedArchiveSite(gateway, URL_OK);
    expect(outcome.kind).toBe('created_field');
    const row = await gateway.findByPrimaryKey('34_MUSEUM_EXHIBITS', ARCHIVE_EXHIBIT_ID, {
      bypass: true,
    });
    expect(row!.row.raw.source_content_id).toBe(URL_OK);
    // Unrelated columns untouched.
    expect(row!.row.raw.wing_id).toBe('archive_wing');
    expect(row!.row.raw.enabled).toBe('TRUE');
  });

  it('is idempotent: rerunning with the same URL changes nothing further', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('34_MUSEUM_EXHIBITS', {
      exhibit_id: ARCHIVE_EXHIBIT_ID,
      wing_id: 'archive_wing',
      exhibit_type: 'archive_portal',
      enabled: 'TRUE',
    });
    await seedArchiveSite(gateway, URL_OK);
    const afterFirst = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });

    const outcome = await seedArchiveSite(gateway, URL_OK);
    expect(outcome.kind).toBe('unchanged');
    const afterSecond = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });
    expect(afterSecond).toEqual(afterFirst);
  });

  it('updates when an existing value differs from the supplied URL', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('34_MUSEUM_EXHIBITS', {
      exhibit_id: ARCHIVE_EXHIBIT_ID,
      wing_id: 'archive_wing',
      exhibit_type: 'archive_portal',
      source_content_id: 'https://old-typo-domain.example/',
      enabled: 'TRUE',
    });
    const outcome = await seedArchiveSite(gateway, URL_OK);
    expect(outcome.kind).toBe('updated');
    const row = await gateway.findByPrimaryKey('34_MUSEUM_EXHIBITS', ARCHIVE_EXHIBIT_ID, {
      bypass: true,
    });
    expect(row!.row.raw.source_content_id).toBe(URL_OK);
  });

  it('rejects a non-https URL and writes nothing', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('34_MUSEUM_EXHIBITS', {
      exhibit_id: ARCHIVE_EXHIBIT_ID,
      wing_id: 'archive_wing',
      exhibit_type: 'archive_portal',
      enabled: 'TRUE',
    });
    const before = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });
    const outcome = await seedArchiveSite(gateway, 'http://varcountdown.web.app/');
    expect(outcome.kind).toBe('rejected');
    const after = await gateway.getRawTab('34_MUSEUM_EXHIBITS', { bypass: true });
    expect(after).toEqual(before);
  });

  it('rejects a non-URL string and writes nothing', async () => {
    const gateway = sheetGateway();
    await gateway.appendRow('34_MUSEUM_EXHIBITS', {
      exhibit_id: ARCHIVE_EXHIBIT_ID,
      wing_id: 'archive_wing',
      exhibit_type: 'archive_portal',
      enabled: 'TRUE',
    });
    const outcome = await seedArchiveSite(gateway, 'not a url');
    expect(outcome.kind).toBe('rejected');
  });
});
