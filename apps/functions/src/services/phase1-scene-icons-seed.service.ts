import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * The six player-control icons the illustrated scenes and the pre-Gate
 * settings button ask the Sheet for. Each is one `09_ICONS` row pointing at
 * one `10_ASSETS` row, whose Drive file is discovered by exact filename under
 * the configured asset root (this backend's Drive client is read-only, so the
 * SVG files must already have been uploaded; no Drive file ID is hard-coded
 * or invented). Design source: `assets/phase1/icons/*.svg`.
 *
 * `asset_type` is `image` on purpose: the media gateway serves only the
 * image/audio/video/pdf families, and `image` already allows `image/svg+xml`.
 * (The older placeholder icon rows use `svg`, which the gateway rejects.)
 * `alt_text_id` names the `08_UI_TEXT` text id the player resolver already
 * looks up for the same control (`player_<key>`), so no new id scheme exists.
 */
export interface SceneIconSeedSpec {
  iconId: string;
  assetId: string;
  filename: string;
  displayName: string;
  altTextId: string;
}

export const SCENE_ICON_SEED_SPECS: readonly SceneIconSeedSpec[] = [
  {
    iconId: 'icon_walk_forward',
    assetId: 'asset_icon_walk_forward',
    filename: 'icon_walk_forward.svg',
    displayName: 'Walk forward',
    altTextId: 'player_forward',
  },
  {
    iconId: 'icon_walk_back',
    assetId: 'asset_icon_walk_back',
    filename: 'icon_walk_back.svg',
    displayName: 'Walk back',
    altTextId: 'player_back',
  },
  {
    iconId: 'icon_look_left',
    assetId: 'asset_icon_look_left',
    filename: 'icon_look_left.svg',
    displayName: 'Look left',
    altTextId: 'player_lookLeft',
  },
  {
    iconId: 'icon_look_right',
    assetId: 'asset_icon_look_right',
    filename: 'icon_look_right.svg',
    displayName: 'Look right',
    altTextId: 'player_lookRight',
  },
  {
    iconId: 'icon_interact',
    assetId: 'asset_icon_interact',
    filename: 'icon_interact.svg',
    displayName: 'Interact',
    altTextId: 'player_interact',
  },
  {
    iconId: 'icon_settings',
    assetId: 'asset_icon_settings',
    filename: 'icon_settings.svg',
    displayName: 'Settings',
    altTextId: 'player_settings',
  },
];

export interface SceneIconSeedOutcome {
  created: string[];
  unchanged: string[];
  /** Nothing was written for these: the SVG was missing, ambiguous, or not an SVG. */
  blocked: Array<{ iconId: string; reason: string }>;
  /** A row with this id already exists with different values; it was left exactly as it was. */
  conflicts: Array<{ tab: '09_ICONS' | '10_ASSETS'; id: string; columns: string[] }>;
}

function differingColumns(raw: Record<string, string>, desired: Record<string, string>): string[] {
  return Object.entries(desired)
    .filter(([column, value]) => (raw[column] ?? '') !== value)
    .map(([column]) => column);
}

/**
 * Idempotent: an asset/icon row is appended only when its id is absent. An
 * existing row is never modified (so any hand edits or formulas survive) — a
 * difference is reported as a conflict instead. A spec whose SVG cannot be
 * cleanly discovered under the asset root writes neither its asset row nor
 * its icon row, so no icon ever points at a file that does not exist.
 */
export async function seedPhase1SceneIcons(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
  specs: readonly SceneIconSeedSpec[] = SCENE_ICON_SEED_SPECS,
): Promise<SceneIconSeedOutcome> {
  const outcome: SceneIconSeedOutcome = { created: [], unchanged: [], blocked: [], conflicts: [] };

  for (const spec of specs) {
    const found = await driveGateway.findUniqueUnderRoot(spec.filename, rootFolderId);
    if (found.kind === 'missing') {
      outcome.blocked.push({ iconId: spec.iconId, reason: `${spec.filename}: missing under root` });
      continue;
    }
    if (found.kind === 'ambiguous') {
      outcome.blocked.push({
        iconId: spec.iconId,
        reason: `${spec.filename}: ${found.matches.length} files share this name under root`,
      });
      continue;
    }
    if (
      !isAllowedMimeForFamily('image', found.metadata.mimeType) ||
      found.metadata.mimeType !== 'image/svg+xml'
    ) {
      outcome.blocked.push({
        iconId: spec.iconId,
        reason: `${spec.filename}: expected image/svg+xml, got ${found.metadata.mimeType}`,
      });
      continue;
    }

    const assetRow: Record<string, string> = {
      asset_id: spec.assetId,
      asset_type: 'image',
      location_id: '',
      scene_id: '',
      drive_file_id: found.metadata.id,
      mobile_drive_file_id: '',
      poster_drive_file_id: '',
      preload_priority: '1',
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: 'Phase 1 player-control icon (design: assets/phase1/icons).',
    };
    const iconRow: Record<string, string> = {
      icon_id: spec.iconId,
      category: 'ui',
      display_name: spec.displayName,
      asset_id: spec.assetId,
      format: 'svg',
      rtl_mirror: 'FALSE',
      alt_text_id: spec.altTextId,
      width_px: '48',
      height_px: '48',
      enabled: 'TRUE',
      version: '1',
    };

    let touched = false;
    const existingAsset = await gateway.findByPrimaryKey('10_ASSETS', spec.assetId, {
      bypass: true,
    });
    if (!existingAsset) {
      await gateway.appendRow('10_ASSETS', assetRow);
      touched = true;
    } else {
      // Notes and version are editorial; compare only what identifies the file.
      const columns = differingColumns(existingAsset.row.raw, {
        asset_type: 'image',
        drive_file_id: found.metadata.id,
        enabled: 'TRUE',
      });
      if (columns.length > 0) {
        outcome.conflicts.push({ tab: '10_ASSETS', id: spec.assetId, columns });
      }
    }

    const existingIcon = await gateway.findByPrimaryKey('09_ICONS', spec.iconId, { bypass: true });
    if (!existingIcon) {
      await gateway.appendRow('09_ICONS', iconRow);
      touched = true;
    } else {
      const columns = differingColumns(existingIcon.row.raw, {
        asset_id: spec.assetId,
        format: 'svg',
        enabled: 'TRUE',
      });
      if (columns.length > 0) {
        outcome.conflicts.push({ tab: '09_ICONS', id: spec.iconId, columns });
      }
    }

    (touched ? outcome.created : outcome.unchanged).push(spec.iconId);
  }

  return outcome;
}
