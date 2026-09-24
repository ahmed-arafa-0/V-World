import type { Request, Response } from 'express';
import type {
  ApiError,
  DevMapPreviewResponse,
  RuntimeAssetStatus,
} from '@veoullas-world/contracts';
import { toSafeApiError } from '../errors/app-error.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { buildMediaRef } from '../services/media-ref.js';

/**
 * The only two `10_ASSETS` rows this dev-only preview ever reads — never the
 * whole tab. Kept in sync with `phase1-map-assets-seed.service.ts`'s
 * `MAP_ASSET_SEED_ROWS`.
 */
const MAP_PREVIEW_ASSET_IDS = ['map_island_transparent', 'map_ocean_loop'] as const;

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * `GET /api/dev/map-preview-assets` — gated by `createDevelopmentOnlyMiddleware`
 * (registered before this handler in `app.ts`) AND owner-session
 * authorization, exactly like `/api/content/runtime`/`/api/media/:assetId`.
 * Returns only the enabled subset of the two known map-preview assets — a
 * disabled or not-yet-seeded asset is silently omitted (never a 500), so
 * the developer preview UI can distinguish "not registered yet" from "an
 * error occurred."
 */
export function createDevMapPreviewHandler(getGateway: () => SheetGateway | null) {
  return async (_req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      const error: ApiError = {
        ok: false,
        code: 'backend_not_configured',
        message: 'Google Sheets backend is not configured.',
      };
      res.status(503).json(error);
      return;
    }

    try {
      const resolved = await Promise.all(
        MAP_PREVIEW_ASSET_IDS.map(async (assetId): Promise<RuntimeAssetStatus | null> => {
          const found = await gateway.findByPrimaryKey('10_ASSETS', assetId);
          if (!found || found.row.values.enabled !== true) return null;

          const version = num(found.row.values.version, 1);
          return {
            assetId,
            assetType: str(found.row.raw.asset_type),
            version,
            preloadPriority: num(found.row.values.preload_priority),
            hasMobileVariant: str(found.row.raw.mobile_drive_file_id).trim() !== '',
            hasPosterVariant: str(found.row.raw.poster_drive_file_id).trim() !== '',
            mediaRef: buildMediaRef(assetId, version),
          };
        }),
      );

      const response: DevMapPreviewResponse = {
        ok: true,
        assets: resolved.filter((a): a is RuntimeAssetStatus => a !== null),
      };
      res.status(200).json(response);
    } catch (err) {
      const { code, message, httpStatus } = toSafeApiError(err);
      const error: ApiError = { ok: false, code, message };
      res.status(httpStatus).json(error);
    }
  };
}
