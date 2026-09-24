import { buildMediaRef } from '../services/media-ref.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { usable } from './common.js';
import { isPlaceholder } from '@veoullas-world/sheet-schema';

/**
 * Same-origin media references for registered, enabled `10_ASSETS` rows that
 * actually have a Drive file configured. Anything else (missing row, disabled,
 * `<PLACEHOLDER>` Drive id) resolves to `null` — the UI then shows its
 * clearly-labelled temporary visual instead of a broken image. Never returns a
 * raw Drive file id.
 */
export async function resolveAssetRefs(
  gateway: SheetGateway,
  assetIds: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(assetIds.filter((id) => usable(id)));
  const out = new Map<string, string>();
  if (wanted.size === 0) return out;
  const assets = await gateway.readTab('10_ASSETS');
  for (const row of assets.rows) {
    if (!wanted.has(row.primaryKeyValue ?? '') || row.values.enabled !== true) continue;
    const drive = (row.raw.drive_file_id ?? '').trim();
    if (!drive || isPlaceholder(drive)) continue;
    out.set(
      row.primaryKeyValue!,
      buildMediaRef(row.primaryKeyValue!, Number(row.raw.version) || 1),
    );
  }
  return out;
}

export async function resolveAssetRef(
  gateway: SheetGateway,
  assetId: string,
): Promise<string | null> {
  return (await resolveAssetRefs(gateway, [assetId])).get(assetId) ?? null;
}

/**
 * The one-asset-id, desktop+mobile-variant convention used by every other scene background
 * (`10_ASSETS.mobile_drive_file_id` on the same row as `drive_file_id`, served by the same
 * `/api/media/:assetId` gateway via `?variant=mobile`). Returns `{ default: null, mobile: null }`
 * for a missing/disabled/placeholder row, and `mobile: null` when only the desktop file is set.
 */
export async function resolveSceneMediaRefs(
  gateway: SheetGateway,
  assetId: string,
): Promise<{ default: string | null; mobile: string | null }> {
  if (!usable(assetId)) return { default: null, mobile: null };
  const assets = await gateway.readTab('10_ASSETS');
  const row = assets.rows.find((r) => r.primaryKeyValue === assetId && r.values.enabled === true);
  if (!row) return { default: null, mobile: null };
  const drive = (row.raw.drive_file_id ?? '').trim();
  if (!drive || isPlaceholder(drive)) return { default: null, mobile: null };
  const base = buildMediaRef(assetId, Number(row.raw.version) || 1);
  const mobileDrive = (row.raw.mobile_drive_file_id ?? '').trim();
  const mobile = mobileDrive && !isPlaceholder(mobileDrive) ? `${base}&variant=mobile` : null;
  return { default: base, mobile };
}
