import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import type { GoogleDriveClient } from '../google/drive-types.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { sendError, serveMediaAsset } from './media.js';

/**
 * The complete, deliberately narrow allowlist for the one and only public
 * media route — Ahmed's 2026-09-18 explicit authorization for the
 * pre-authentication Gate's real art: the closed-Gate background (desktop
 * AND its mobile variant, served through the existing `variant=mobile`
 * query the shared pipeline already supports) and the no-collar companion
 * reveal still. See `docs/assets/PHASE_1_ASSET_HANDOFF.md` §6 for the
 * history of why this was previously left unwired — this supersedes that
 * "zero public assets" posture for exactly these two ids and no others.
 *
 * Adding an id here is a real, deliberate widening of the public surface —
 * never do it implicitly as a side effect of some other change.
 */
export const PUBLIC_MEDIA_ASSET_IDS: ReadonlySet<string> = new Set([
  'gate_closed_bg',
  'var_idle_no_collar',
]);

/**
 * The one pre-Gate control icon that may be fetched without a session: the
 * settings button is on screen before any owner session exists. Keyed by
 * `09_ICONS.icon_id`, valued by the exact `10_ASSETS.asset_id` that icon must
 * currently reference for the public route to serve it. Adding an entry is a
 * deliberate widening of the public surface, like the ids above.
 */
export const PUBLIC_ICON_ASSETS: ReadonlyMap<string, string> = new Map([
  ['icon_settings', 'asset_icon_settings'],
]);
const PUBLIC_ICON_ASSET_IDS: ReadonlySet<string> = new Set(PUBLIC_ICON_ASSETS.values());

function notFoundLikeUnknownRoute(req: Request): ApiError {
  // Deliberately the exact same generic shape `app.ts`'s catch-all 404
  // uses for a truly unknown route (mirroring `development-only-middleware.ts`'s
  // approach) — an asset id outside the allowlist must be indistinguishable
  // from "no such route exists" at the wire level, never a distinct
  // "forbidden"/"not allowlisted" signal that would let a caller enumerate
  // which ids are allowlisted by probing.
  return {
    ok: false,
    code: 'not_found',
    message: `No route for ${req.method} ${req.path}`,
  };
}

/**
 * `GET`/`HEAD /api/public-media/:assetId?v={version}&variant={default|mobile}`
 * — deliberately PUBLIC (no owner session required, wired in app.ts
 * alongside `/api/content/pre-gate`), but only for the two ids in
 * `PUBLIC_MEDIA_ASSET_IDS` above. Every other asset id — including a real,
 * enabled `10_ASSETS` row — 404s exactly like an unrecognized route,
 * before any Sheet/Drive lookup happens at all. Reuses the exact same
 * validated `serveMediaAsset` pipeline `/api/media/:assetId` uses (MIME,
 * containment-under-root, range, streaming) — the owner-session-protected
 * route is completely unaffected and keeps serving every other asset
 * exactly as before.
 */
export function createPublicMediaHandler(
  getGateway: () => SheetGateway | null,
  getDriveClient: () => GoogleDriveClient | null,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const assetId = typeof req.params.assetId === 'string' ? req.params.assetId : '';
    if (!PUBLIC_MEDIA_ASSET_IDS.has(assetId) && !PUBLIC_ICON_ASSET_IDS.has(assetId)) {
      res.status(404).json(notFoundLikeUnknownRoute(req));
      return;
    }

    const gateway = getGateway();
    const driveClient = getDriveClient();
    if (!gateway || !driveClient) {
      sendError(
        res,
        new AppError('backend_not_configured', 'The media backend is not configured.'),
      );
      return;
    }

    await serveMediaAsset(req, res, gateway, driveClient);
  };
}
