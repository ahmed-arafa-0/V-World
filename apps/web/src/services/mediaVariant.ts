import type { RuntimeAssetStatus } from '@veoullas-world/contracts';

/**
 * Same-origin mobile-variant media reference for an asset that registered
 * one in `10_ASSETS` (`mobile_drive_file_id`), or `null` when it didn't.
 * Built by appending the existing `/api/media/:assetId` gateway's own
 * `variant=mobile` query parameter to the already-resolved `mediaRef` —
 * never a second asset id, and never a raw Drive file ID.
 */
export function mobileMediaRef(asset: RuntimeAssetStatus): string | null {
  return asset.hasMobileVariant ? `${asset.mediaRef}&variant=mobile` : null;
}
