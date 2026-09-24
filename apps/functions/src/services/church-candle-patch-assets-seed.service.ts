import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * The Church candle-patch art (`assets/Veoulla_Church_Candle_Patch/`): a revised `church_interior_scene`
 * with the painted candles removed from the brass tray, and a new `church_candle_corner_scene` close-up
 * with an empty sand tray for the interactive candle sprites. Same discovery/idempotency shape as
 * `phase2-art-assets-seed.service.ts` (exact-filename Drive lookup, full containment/MIME proof, version
 * bumped only on an actual media change), kept as its own small, focused seed rather than folding into
 * the much larger Phase 2 spec list — this patch touches exactly these two logical assets.
 *
 * `church_interior_scene` is an EXISTING registration: its Drive files are only ever patched (its
 * `version` bumps by one), never recreated. `church_candle_corner_scene` is a NEW registration (not the
 * older, unrelated, never-adopted `church_candle_corner` "proposed_optional" closeup from the original
 * art pack manifest — a different asset id, left untouched): it starts at `version` 1.
 */
export interface ChurchCandlePatchSpec {
  assetId: string;
  desktopFile: string;
  mobileFile: string;
  notes: string;
}

export const CHURCH_CANDLE_PATCH_SPECS: readonly ChurchCandlePatchSpec[] = [
  {
    assetId: 'church_interior_scene',
    desktopFile: 'church_interior_scene_desktop_v2.png',
    mobileFile: 'church_interior_scene_mobile_v2.png',
    notes:
      'Church candle patch: same interior, painted candles removed from the left brass tray (now interactive sprites only). Wall lanterns retained.',
  },
  {
    assetId: 'church_candle_corner_scene',
    desktopFile: 'church_candle_corner_scene_desktop_v1.png',
    mobileFile: 'church_candle_corner_scene_mobile_v1.png',
    notes:
      'Church candle patch: the candle-corner close-up (empty sand tray; candle sprites are placed by code).',
  },
];

export function allChurchCandlePatchFilenames(): string[] {
  const names = new Set<string>();
  for (const s of CHURCH_CANDLE_PATCH_SPECS) {
    names.add(s.desktopFile);
    names.add(s.mobileFile);
  }
  return [...names];
}

export interface DiscoveredPatchFile {
  filename: string;
  fileId: string;
  mimeType: string;
}
export interface PatchDiscoveryIssue {
  filename: string;
  issue: 'missing' | 'ambiguous' | 'unsupported_mime' | 'not_png';
  detail?: string;
}

/** Read-only: discovers each file by exact filename under the configured Drive asset root. Never uploads. */
export async function discoverChurchCandlePatchFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{ found: Map<string, DiscoveredPatchFile>; issues: PatchDiscoveryIssue[] }> {
  const found = new Map<string, DiscoveredPatchFile>();
  const issues: PatchDiscoveryIssue[] = [];
  for (const filename of allChurchCandlePatchFilenames()) {
    const result = await driveGateway.findUniqueUnderRoot(filename, rootFolderId);
    if (result.kind === 'missing') {
      issues.push({ filename, issue: 'missing' });
    } else if (result.kind === 'ambiguous') {
      issues.push({ filename, issue: 'ambiguous', detail: `${result.matches.length} matches` });
    } else if (!isAllowedMimeForFamily('image', result.metadata.mimeType)) {
      issues.push({ filename, issue: 'unsupported_mime', detail: result.metadata.mimeType });
    } else if (result.metadata.mimeType !== 'image/png') {
      issues.push({ filename, issue: 'not_png', detail: result.metadata.mimeType });
    } else {
      found.set(filename, {
        filename,
        fileId: result.metadata.id,
        mimeType: result.metadata.mimeType,
      });
    }
  }
  return { found, issues };
}

export interface PatchSeedOutcome {
  /** New `10_ASSETS` rows created (starts at version 1). */
  created: string[];
  /** Existing rows whose Drive file actually changed (version bumped by one). */
  updated: Array<{ assetId: string; version: string }>;
  /** Rows already pointing at these exact Drive files (a safe re-run). */
  unchanged: string[];
  /** A spec whose file(s) were not found/usable on Drive yet; nothing was written for it. */
  blocked: Array<{ assetId: string; reasons: string[] }>;
}

/**
 * Idempotently upserts the two church-candle-patch rows into `10_ASSETS`. Only the columns this seed
 * owns (`asset_type`, `location_id`, `drive_file_id`, `mobile_drive_file_id`) are ever patched — every
 * other column on an existing row, and every other row in the tab, is left exactly as it was.
 */
export async function seedChurchCandlePatchAssets(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{
  discovery: Awaited<ReturnType<typeof discoverChurchCandlePatchFiles>>;
  outcome: PatchSeedOutcome;
}> {
  const discovery = await discoverChurchCandlePatchFiles(driveGateway, rootFolderId);
  const outcome: PatchSeedOutcome = { created: [], updated: [], unchanged: [], blocked: [] };
  const assets = await gateway.readTab('10_ASSETS', { bypass: true });
  const byId = new Map(
    assets.rows.map((r) => [r.primaryKeyValue ?? '', { ...r.raw } as Record<string, string>]),
  );

  for (const spec of CHURCH_CANDLE_PATCH_SPECS) {
    const missing = [spec.desktopFile, spec.mobileFile]
      .filter((f) => !discovery.found.has(f))
      .map((f) => {
        const issue = discovery.issues.find((i) => i.filename === f);
        return `${f}: ${issue?.issue ?? 'unknown'}${issue?.detail ? ` (${issue.detail})` : ''}`;
      });
    if (missing.length > 0) {
      outcome.blocked.push({ assetId: spec.assetId, reasons: missing });
      continue;
    }
    const driveFileId = discovery.found.get(spec.desktopFile)!.fileId;
    const mobileDriveFileId = discovery.found.get(spec.mobileFile)!.fileId;
    const existing = byId.get(spec.assetId);

    if (!existing) {
      const row = {
        asset_id: spec.assetId,
        asset_type: 'image',
        location_id: 'church',
        scene_id: '',
        drive_file_id: driveFileId,
        mobile_drive_file_id: mobileDriveFileId,
        poster_drive_file_id: '',
        preload_priority: '1',
        loop: 'FALSE',
        enabled: 'TRUE',
        version: '1',
        notes: spec.notes,
      };
      await gateway.appendRow('10_ASSETS', row);
      byId.set(spec.assetId, row);
      outcome.created.push(spec.assetId);
      continue;
    }

    const patch: Record<string, string> = {};
    if ((existing.asset_type ?? '') !== 'image') patch.asset_type = 'image';
    if ((existing.drive_file_id ?? '') !== driveFileId) patch.drive_file_id = driveFileId;
    if ((existing.mobile_drive_file_id ?? '') !== mobileDriveFileId) {
      patch.mobile_drive_file_id = mobileDriveFileId;
    }
    if (Object.keys(patch).length === 0) {
      outcome.unchanged.push(spec.assetId);
      continue;
    }
    const current = Number.parseInt(existing.version ?? '', 10);
    patch.version = String((Number.isFinite(current) ? current : 0) + 1);
    await gateway.updateByPrimaryKey('10_ASSETS', spec.assetId, patch);
    Object.assign(existing, patch);
    outcome.updated.push({ assetId: spec.assetId, version: patch.version });
  }

  return { discovery, outcome };
}
