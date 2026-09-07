import { describe, expect, it } from 'vitest';
import { headerFor, row } from '@veoullas-world/test-fixtures';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import {
  getDriveRootFolderId,
  isAllowedMimeForFamily,
  isKnownAssetFamily,
  resolveMediaAsset,
} from '../src/services/media-asset.service.js';
import { AppError } from '../src/errors/app-error.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

const WORKBOOK: Record<string, string[][]> = {
  '01_APP_CONFIG': [
    headerFor('01_APP_CONFIG'),
    row('01_APP_CONFIG', {
      config_key: 'drive_root_folder_id',
      value: 'root_folder_fixture',
      value_type: 'drive_folder_id',
      description: 'fixture',
      enabled: 'TRUE',
      restart_required: 'FALSE',
    }),
    row('01_APP_CONFIG', {
      config_key: 'drive_root_folder_id_disabled',
      value: 'should_not_be_used',
      value_type: 'drive_folder_id',
      description: 'fixture — disabled row must never be used',
      enabled: 'FALSE',
      restart_required: 'FALSE',
    }),
  ],
  '10_ASSETS': [
    headerFor('10_ASSETS'),
    row('10_ASSETS', {
      asset_id: 'asset_full',
      asset_type: 'image',
      drive_file_id: 'drive_default_full',
      mobile_drive_file_id: 'drive_mobile_full',
      poster_drive_file_id: 'drive_poster_full',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '3',
      notes: 'fixture',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_default_only',
      asset_type: 'video',
      drive_file_id: 'drive_default_only',
      mobile_drive_file_id: '',
      poster_drive_file_id: '',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'fixture — no mobile/poster configured',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_disabled',
      asset_type: 'image',
      drive_file_id: 'drive_disabled',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'FALSE',
      version: '1',
      notes: 'fixture',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_unsupported_type',
      asset_type: 'spreadsheet',
      drive_file_id: 'drive_unsupported',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'fixture — not a known media family',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_video_with_poster',
      asset_type: 'video',
      drive_file_id: 'drive_video_default',
      poster_drive_file_id: 'drive_video_poster',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'fixture — video asset with an image poster',
    }),
    row('10_ASSETS', {
      asset_id: 'asset_placeholder_default',
      asset_type: 'image',
      drive_file_id: '<DRIVE_FILE_ID_NOT_SET>',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'fixture — placeholder must be treated as unset',
    }),
  ],
};

function makeGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('resolveMediaAsset', () => {
  it('resolves the default variant', async () => {
    const resolved = await resolveMediaAsset(makeGateway(), 'asset_full', '3', 'default');
    expect(resolved).toEqual({
      assetId: 'asset_full',
      fileId: 'drive_default_full',
      assetFamily: 'image',
      expectedMimeFamily: 'image',
      version: 3,
    });
  });

  it('expects an "image" MIME family for a poster variant even on a video asset', async () => {
    const defaultResolved = await resolveMediaAsset(
      makeGateway(),
      'asset_video_with_poster',
      '1',
      'default',
    );
    expect(defaultResolved.assetFamily).toBe('video');
    expect(defaultResolved.expectedMimeFamily).toBe('video');

    const posterResolved = await resolveMediaAsset(
      makeGateway(),
      'asset_video_with_poster',
      '1',
      'poster',
    );
    expect(posterResolved.assetFamily).toBe('video');
    expect(posterResolved.expectedMimeFamily).toBe('image');
    expect(posterResolved.fileId).toBe('drive_video_poster');
  });

  it('resolves the mobile variant when configured', async () => {
    const resolved = await resolveMediaAsset(makeGateway(), 'asset_full', '3', 'mobile');
    expect(resolved.fileId).toBe('drive_mobile_full');
  });

  it('falls back to the default file when no mobile variant is configured', async () => {
    const resolved = await resolveMediaAsset(makeGateway(), 'asset_default_only', '1', 'mobile');
    expect(resolved.fileId).toBe('drive_default_only');
  });

  it('resolves the poster variant when configured', async () => {
    const resolved = await resolveMediaAsset(makeGateway(), 'asset_full', '3', 'poster');
    expect(resolved.fileId).toBe('drive_poster_full');
  });

  it('rejects a missing poster variant with MEDIA_VARIANT_NOT_FOUND', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_default_only', '1', 'poster'),
    ).rejects.toMatchObject({ code: 'MEDIA_VARIANT_NOT_FOUND' });
  });

  it('rejects an unknown asset ID with MEDIA_ASSET_NOT_FOUND', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_does_not_exist', '1', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_NOT_FOUND' });
  });

  it('rejects a disabled asset with MEDIA_ASSET_DISABLED, never reaching Drive', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_disabled', '1', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_DISABLED' });
  });

  it('rejects a version mismatch with MEDIA_VERSION_MISMATCH', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_full', '2', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_VERSION_MISMATCH' });
  });

  it('rejects a malformed/empty asset ID with MEDIA_ASSET_INVALID', async () => {
    await expect(resolveMediaAsset(makeGateway(), '', '1', 'default')).rejects.toMatchObject({
      code: 'MEDIA_ASSET_INVALID',
    });
    await expect(
      resolveMediaAsset(makeGateway(), 'not valid!', '1', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_INVALID' });
  });

  it('rejects a missing/non-numeric version with MEDIA_ASSET_INVALID', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_full', undefined, 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_INVALID' });
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_full', 'v3', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_INVALID' });
  });

  it('rejects an asset_type outside the known media families with MEDIA_UNSUPPORTED_MIME', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_unsupported_type', '1', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_UNSUPPORTED_MIME' });
  });

  it('treats an un-replaced placeholder Drive file ID as not configured', async () => {
    await expect(
      resolveMediaAsset(makeGateway(), 'asset_placeholder_default', '1', 'default'),
    ).rejects.toMatchObject({ code: 'MEDIA_VARIANT_NOT_FOUND' });
  });

  it('never throws anything but AppError for any rejection path', async () => {
    try {
      await resolveMediaAsset(makeGateway(), 'asset_disabled', '1', 'default');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });
});

describe('getDriveRootFolderId', () => {
  it('reads the enabled drive_root_folder_id value', async () => {
    expect(await getDriveRootFolderId(makeGateway())).toBe('root_folder_fixture');
  });

  it('throws GOOGLE_CONFIG_NOT_FOUND when the row is missing/disabled', async () => {
    const gateway = new SheetGateway(
      new FakeGoogleSheetsClient(
        structuredClone({
          '01_APP_CONFIG': [headerFor('01_APP_CONFIG')],
        }),
      ),
      { ttlSeconds: 60 },
    );
    await expect(getDriveRootFolderId(gateway)).rejects.toMatchObject({
      code: 'GOOGLE_CONFIG_NOT_FOUND',
    });
  });
});

describe('media family / MIME allowlist', () => {
  it('recognizes exactly the four known asset families', () => {
    expect(isKnownAssetFamily('image')).toBe(true);
    expect(isKnownAssetFamily('audio')).toBe(true);
    expect(isKnownAssetFamily('video')).toBe(true);
    expect(isKnownAssetFamily('pdf')).toBe(true);
    expect(isKnownAssetFamily('spreadsheet')).toBe(false);
    expect(isKnownAssetFamily('')).toBe(false);
  });

  it('allows only the approved MIME types per family', () => {
    expect(isAllowedMimeForFamily('image', 'image/png')).toBe(true);
    expect(isAllowedMimeForFamily('image', 'image/svg+xml')).toBe(true);
    expect(isAllowedMimeForFamily('image', 'text/html')).toBe(false);
    expect(isAllowedMimeForFamily('audio', 'audio/mpeg')).toBe(true);
    expect(isAllowedMimeForFamily('audio', 'video/mp4')).toBe(false);
    expect(isAllowedMimeForFamily('video', 'video/mp4')).toBe(true);
    expect(isAllowedMimeForFamily('pdf', 'application/pdf')).toBe(true);
    expect(isAllowedMimeForFamily('pdf', 'application/javascript')).toBe(false);
  });

  it('rejects HTML, JavaScript, and executable-shaped MIME types for every family', () => {
    const forbidden = [
      'text/html',
      'application/javascript',
      'text/javascript',
      'application/x-msdownload',
      'application/octet-stream',
    ];
    for (const family of ['image', 'audio', 'video', 'pdf'] as const) {
      for (const mime of forbidden) {
        expect(isAllowedMimeForFamily(family, mime)).toBe(false);
      }
    }
  });
});
