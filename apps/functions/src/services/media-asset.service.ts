import { isPlaceholder } from '@veoullas-world/sheet-schema';
import type { MediaVariant } from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * The only media families this backend will ever serve, keyed by
 * `10_ASSETS.asset_type`. PDF is included because the current asset
 * registry (this map, sourced from that Sheet column) explicitly allows it;
 * any other `asset_type` value is an unsupported family by default-deny.
 */
export type MediaAssetFamily = 'image' | 'audio' | 'video' | 'pdf';

const KNOWN_FAMILIES: readonly MediaAssetFamily[] = ['image', 'audio', 'video', 'pdf'];

export const ALLOWED_MIME_TYPES_BY_FAMILY: Record<MediaAssetFamily, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  pdf: ['application/pdf'],
};

export function isKnownAssetFamily(value: string): value is MediaAssetFamily {
  return (KNOWN_FAMILIES as readonly string[]).includes(value);
}

export function isAllowedMimeForFamily(family: MediaAssetFamily, mimeType: string): boolean {
  return ALLOWED_MIME_TYPES_BY_FAMILY[family].includes(mimeType);
}

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface ResolvedMediaAsset {
  assetId: string;
  fileId: string;
  /** The asset's own `10_ASSETS.asset_type` family (e.g. a video asset stays "video" even when resolving its poster). */
  assetFamily: MediaAssetFamily;
  /** The family the resolved file's MIME type must actually belong to — always "image" for a poster, regardless of the asset's own family. */
  expectedMimeFamily: MediaAssetFamily;
  version: number;
}

/** Blank, whitespace-only, and un-replaced `<...>` placeholder values are all "not configured." */
function cleanDriveIdValue(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || isPlaceholder(value)) return '';
  return value;
}

/**
 * Resolves a browser-supplied `(assetId, version, variant)` triple to a
 * server-only Drive file ID, entirely through the accepted Sheet gateway.
 * The browser never supplies — and this function never returns — a raw
 * Drive file ID to anything outside this backend process.
 */
export async function resolveMediaAsset(
  gateway: SheetGateway,
  assetId: string,
  requestedVersionRaw: string | undefined,
  variant: MediaVariant,
  options?: ReadOptions,
): Promise<ResolvedMediaAsset> {
  if (!assetId || !ASSET_ID_PATTERN.test(assetId)) {
    throw new AppError('MEDIA_ASSET_INVALID', 'The requested asset ID is not valid.');
  }
  if (!requestedVersionRaw || !/^\d+$/.test(requestedVersionRaw)) {
    throw new AppError('MEDIA_ASSET_INVALID', 'A numeric asset version is required.');
  }
  const requestedVersion = Number(requestedVersionRaw);

  const found = await gateway.findByPrimaryKey('10_ASSETS', assetId, options);
  if (!found) {
    throw new AppError('MEDIA_ASSET_NOT_FOUND', 'The requested asset does not exist.');
  }

  const row = found.row;
  if (row.values.enabled !== true) {
    throw new AppError('MEDIA_ASSET_DISABLED', 'The requested asset is disabled.');
  }

  const currentVersion = typeof row.values.version === 'number' ? row.values.version : 1;
  if (requestedVersion !== currentVersion) {
    throw new AppError(
      'MEDIA_VERSION_MISMATCH',
      'The requested asset version does not match the current version.',
    );
  }

  const assetType = String(row.raw.asset_type ?? '');
  if (!isKnownAssetFamily(assetType)) {
    throw new AppError(
      'MEDIA_UNSUPPORTED_MIME',
      'This asset type is not a supported media family.',
    );
  }

  const defaultFileId = cleanDriveIdValue(row.raw.drive_file_id);
  let fileId: string;

  if (variant === 'poster') {
    const posterFileId = cleanDriveIdValue(row.raw.poster_drive_file_id);
    if (!posterFileId) {
      throw new AppError(
        'MEDIA_VARIANT_NOT_FOUND',
        'No poster variant is configured for this asset.',
      );
    }
    fileId = posterFileId;
  } else if (variant === 'mobile') {
    const mobileFileId = cleanDriveIdValue(row.raw.mobile_drive_file_id);
    fileId = mobileFileId || defaultFileId;
    if (!fileId) {
      throw new AppError(
        'MEDIA_VARIANT_NOT_FOUND',
        'No default or mobile file is configured for this asset.',
      );
    }
  } else {
    if (!defaultFileId) {
      throw new AppError(
        'MEDIA_VARIANT_NOT_FOUND',
        'No default file is configured for this asset.',
      );
    }
    fileId = defaultFileId;
  }

  return {
    assetId,
    fileId,
    assetFamily: assetType,
    expectedMimeFamily: variant === 'poster' ? 'image' : assetType,
    version: currentVersion,
  };
}

/** Reads the configured Drive asset-root folder ID from 01_APP_CONFIG. Never a secret, but backend-only. */
export async function getDriveRootFolderId(
  gateway: SheetGateway,
  options?: ReadOptions,
): Promise<string> {
  const result = await gateway.readTab('01_APP_CONFIG', options);
  const match = result.rows.find(
    (r) => r.primaryKeyValue === 'drive_root_folder_id' && r.values.enabled === true,
  );
  const value = cleanDriveIdValue(match?.raw.value);
  if (!value) {
    throw new AppError('GOOGLE_CONFIG_NOT_FOUND', 'The Drive asset root folder is not configured.');
  }
  return value;
}
