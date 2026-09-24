import { isAllowedMimeForFamily } from './media-asset.service.js';
import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Registers Ahmed's supplied comic PDF (a known Drive file ID, not a
 * filename discovery — he gave the exact file link) into `10_ASSETS` as
 * `comic_pdf_2025`, the asset the Museum's `exhibit_comic_2025` already
 * references via `source_content_id` (see `docs/content/REAL_CONTENT_GAPS.md`
 * §9). Read-only against Drive: verifies the file is not trashed, is
 * `application/pdf`, and actually lives under the configured asset root
 * before writing anything — the same containment proof `serveMediaAsset`
 * enforces at request time (`DriveGateway.isUnderRoot`). Never uploads.
 */
export const COMIC_ASSET_ID = 'comic_pdf_2025';
const COMIC_LOCATION_ID = 'museum';

export interface ComicSourceVerification {
  fileId: string;
  trashed: boolean;
  mimeType: string;
  mimeOk: boolean;
  underRoot: boolean;
}

export type ComicSourceOutcome =
  | { kind: 'blocked'; verification: ComicSourceVerification; reasons: string[] }
  | { kind: 'created'; verification: ComicSourceVerification }
  | { kind: 'updated'; verification: ComicSourceVerification; version: string }
  | { kind: 'unchanged'; verification: ComicSourceVerification };

export async function seedComicSource(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
  fileId: string,
): Promise<ComicSourceOutcome> {
  const metadata = await driveGateway.getMetadata(fileId);
  const mimeOk = isAllowedMimeForFamily('pdf', metadata.mimeType);
  const underRoot = metadata.trashed
    ? false
    : await driveGateway.isUnderRoot(metadata, rootFolderId);
  const verification: ComicSourceVerification = {
    fileId,
    trashed: metadata.trashed,
    mimeType: metadata.mimeType,
    mimeOk,
    underRoot,
  };

  const reasons: string[] = [];
  if (metadata.trashed) reasons.push('file is trashed');
  if (!mimeOk)
    reasons.push(`unsupported mime type "${metadata.mimeType}" (expected application/pdf)`);
  if (!underRoot) reasons.push('file is outside the configured Drive asset root');
  if (reasons.length > 0) return { kind: 'blocked', verification, reasons };

  const existing = await gateway.findByPrimaryKey('10_ASSETS', COMIC_ASSET_ID, { bypass: true });
  if (!existing) {
    await gateway.appendRow('10_ASSETS', {
      asset_id: COMIC_ASSET_ID,
      asset_type: 'pdf',
      location_id: COMIC_LOCATION_ID,
      scene_id: '',
      drive_file_id: fileId,
      mobile_drive_file_id: '',
      poster_drive_file_id: '',
      preload_priority: '5',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'The existing birthday comic PDF — Museum "Stories" wing (exhibit_comic_2025).',
    });
    return { kind: 'created', verification };
  }

  const patch: Record<string, string> = {};
  if ((existing.row.raw.asset_type ?? '') !== 'pdf') patch.asset_type = 'pdf';
  if ((existing.row.raw.drive_file_id ?? '') !== fileId) patch.drive_file_id = fileId;
  if (existing.row.values.enabled !== true) patch.enabled = 'TRUE';
  if (Object.keys(patch).length === 0) return { kind: 'unchanged', verification };

  const current = Number.parseInt(existing.row.raw.version ?? '', 10);
  patch.version = String((Number.isFinite(current) ? current : 0) + 1);
  await gateway.updateByPrimaryKey('10_ASSETS', COMIC_ASSET_ID, patch, existing);
  return { kind: 'updated', verification, version: patch.version };
}
