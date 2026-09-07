import type { Request, Response } from 'express';
import type { ApiError, MediaVariant } from '@veoullas-world/contracts';
import { isMediaVariant } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import { DRIVE_SHORTCUT_MIME_TYPE, type GoogleDriveClient } from '../google/drive-types.js';
import { parseRangeHeader } from '../http/byte-range.js';
import { buildMediaHeaders } from '../http/media-headers.js';
import { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import {
  getDriveRootFolderId,
  isAllowedMimeForFamily,
  resolveMediaAsset,
} from '../services/media-asset.service.js';

function sendError(res: Response, err: unknown): void {
  const { code, message, httpStatus } = toSafeApiError(err);
  const error: ApiError = { ok: false, code, message };
  res.status(httpStatus).json(error);
}

function readVariant(req: Request): MediaVariant | { invalid: true } {
  const raw = req.query.variant;
  if (typeof raw !== 'string' || raw.length === 0) return 'default';
  return isMediaVariant(raw) ? raw : { invalid: true };
}

/**
 * `GET`/`HEAD /api/media/:assetId?v={version}&variant={default|mobile|poster}`
 * — owner-session-protected (wired in app.ts). Every request is resolved
 * through the accepted Sheet gateway first (`resolveMediaAsset`); a Drive
 * call only ever happens for an enabled asset at the exact requested
 * version. Never accepts a raw Drive file ID from the browser, and never
 * returns one, an authorization header, an access token, service-account
 * data, or a raw Google error in any response.
 */
export function createMediaHandler(
  getGateway: () => SheetGateway | null,
  getDriveClient: () => GoogleDriveClient | null,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    const driveClient = getDriveClient();
    if (!gateway || !driveClient) {
      sendError(
        res,
        new AppError('backend_not_configured', 'The media backend is not configured.'),
      );
      return;
    }

    const variant = readVariant(req);
    if (typeof variant === 'object') {
      sendError(
        res,
        new AppError('MEDIA_ASSET_INVALID', 'The requested variant is not recognized.'),
      );
      return;
    }

    const assetId = typeof req.params.assetId === 'string' ? req.params.assetId : '';
    const requestedVersion = typeof req.query.v === 'string' ? req.query.v : undefined;

    try {
      const resolved = await resolveMediaAsset(gateway, assetId, requestedVersion, variant);
      const rootFolderId = await getDriveRootFolderId(gateway);
      const driveGateway = new DriveGateway(driveClient);

      const metadata = await driveGateway.getMetadata(resolved.fileId);

      if (metadata.trashed) {
        throw new AppError(
          'MEDIA_FILE_INACCESSIBLE',
          'The referenced media file is not accessible.',
        );
      }
      if (metadata.mimeType === DRIVE_SHORTCUT_MIME_TYPE) {
        // B1 policy: reject every shortcut rather than resolving its target.
        // A safe, documented rejection is preferred over the added
        // complexity/risk of proving a shortcut's target lies under the
        // approved root — see the M03-B1 checkpoint report.
        throw new AppError(
          'MEDIA_SHORTCUT_REJECTED',
          'Drive shortcuts are not supported for media assets.',
        );
      }
      if (!isAllowedMimeForFamily(resolved.expectedMimeFamily, metadata.mimeType)) {
        throw new AppError(
          'MEDIA_UNSUPPORTED_MIME',
          'The referenced file type is not a supported media format.',
        );
      }

      const underRoot = await driveGateway.isUnderRoot(metadata, rootFolderId);
      if (!underRoot) {
        throw new AppError(
          'MEDIA_FILE_OUTSIDE_ROOT',
          'The referenced media file is outside the approved asset root.',
        );
      }

      if (metadata.size === null) {
        throw new AppError(
          'MEDIA_FILE_INACCESSIBLE',
          'The referenced media file has no known size.',
        );
      }
      const totalSize = metadata.size;

      const rangeResult = parseRangeHeader(req.headers.range, totalSize);
      if (rangeResult.type === 'malformed') {
        throw new AppError(
          'MEDIA_RANGE_MALFORMED',
          'The requested Range header is malformed or unsupported.',
        );
      }
      if (rangeResult.type === 'unsatisfiable') {
        res
          .status(416)
          .set({ 'Content-Range': `bytes */${totalSize}`, 'X-Content-Type-Options': 'nosniff' })
          .end();
        return;
      }

      const range =
        rangeResult.type === 'satisfiable'
          ? { start: rangeResult.start, end: rangeResult.end }
          : null;

      res.set(
        buildMediaHeaders({
          assetId: resolved.assetId,
          version: resolved.version,
          variant,
          mimeType: metadata.mimeType,
          totalSize,
          range,
        }),
      );
      res.status(range ? 206 : 200);

      if (req.method === 'HEAD') {
        // Metadata only — no content stream is ever requested for HEAD.
        res.end();
        return;
      }

      const { stream } = await driveGateway.getContentStream(resolved.fileId, range ?? undefined);

      req.on('close', () => {
        stream.destroy?.();
      });
      stream.on('error', () => {
        if (!res.headersSent) {
          sendError(res, new AppError('MEDIA_UPSTREAM_UNAVAILABLE', 'The media stream failed.'));
        } else {
          res.destroy();
        }
      });

      stream.pipe(res);
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendError(res, err);
    }
  };
}
