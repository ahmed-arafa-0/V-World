import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';
import type { SeedOutcome } from './access-config-seed.service.js';

/**
 * The 10 real `10_ASSETS` rows Ahmed's Phase 1 artwork handoff supplies,
 * mapped from the exact filenames his ZIP preserves (see
 * `assets/phase1/asset_manifest.json` and
 * `docs/assets/PHASE_1_ASSET_HANDOFF.md` §0's mapping table). No Drive file
 * ID is hard-coded here — every one is discovered by exact filename under
 * the configured asset root at seed time (`discoverPhase1SceneAssetFiles`),
 * since this backend's Drive client is read-only and was never handed an
 * ID directly.
 */
export interface SceneAssetSeedRowSpec {
  assetId: string;
  locationId: string;
  /** Desktop file → `drive_file_id`, for a scene background with a desktop/mobile pair. */
  desktopFile?: string;
  /** Mobile file → `mobile_drive_file_id`, for a scene background with a desktop/mobile pair. */
  mobileFile?: string;
  /** A single character still with no separate mobile crop → `drive_file_id` only. */
  singleFile?: string;
  loop: 'TRUE' | 'FALSE';
  preloadPriority: string;
  notes: string;
}

export const SCENE_CHARACTER_ASSET_SEED_ROWS: SceneAssetSeedRowSpec[] = [
  {
    assetId: 'gate_closed_bg',
    locationId: 'gate',
    desktopFile: 'gate_closed_desktop_v1.png',
    mobileFile: 'gate_closed_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes: 'Phase 1 real art — closed Gate dial-entry background. Served publicly (pre-Gate).',
  },
  {
    assetId: 'gate_ajar_static_bg',
    locationId: 'gate',
    desktopFile: 'gate_ajar_desktop_v1.png',
    mobileFile: 'gate_ajar_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes:
      'Phase 1 real art — Gate-ajar static fallback still (not a door animation), post-Gate-success only.',
  },
  {
    assetId: 'beach_focus_scene',
    locationId: 'beach',
    desktopFile: 'beach_focus_desktop_v1.png',
    mobileFile: 'beach_focus_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes: 'Phase 1 real art — sceneDefinitions.ts node "beach_focus" complete background.',
  },
  {
    assetId: 'beach_three_steps_scene',
    locationId: 'beach',
    desktopFile: 'beach_three_steps_desktop_v1.png',
    mobileFile: 'beach_three_steps_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes: 'Phase 1 real art — sceneDefinitions.ts node "beach_steps" complete background.',
  },
  {
    assetId: 'steps_church_approach_scene',
    locationId: 'church',
    desktopFile: 'church_approach_desktop_v1.png',
    mobileFile: 'church_approach_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes:
      'Phase 1 real art — sceneDefinitions.ts node "steps_church_approach" complete background.',
  },
  {
    assetId: 'church_focus_scene',
    locationId: 'church',
    desktopFile: 'church_focus_desktop_v1.png',
    mobileFile: 'church_focus_mobile_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes:
      'Phase 1 real art — sceneDefinitions.ts node "church_focus" complete background (exterior only).',
  },
  {
    assetId: 'var_idle_no_collar',
    locationId: 'beach',
    singleFile: 'cat_idle_no_collar_v1.png',
    loop: 'FALSE',
    preloadPriority: '2',
    notes:
      'Phase 1 real art — seated, before naming. Used in NamingPrompt and (public, pre-Gate) the reveal beat.',
  },
  {
    assetId: 'var_idle_collar',
    locationId: 'beach',
    singleFile: 'cat_idle_collar_v1.png',
    loop: 'FALSE',
    preloadPriority: '2',
    notes: 'Phase 1 real art — seated, after naming (collar carries the chosen name).',
  },
  {
    assetId: 'var_walk_collar',
    locationId: 'beach',
    singleFile: 'cat_walk_collar_v1.png',
    loop: 'FALSE',
    preloadPriority: '3',
    notes:
      'Phase 1 real art — walking, wearing collar. Beach/Church exploration companion overlay.',
  },
  {
    assetId: 'var_jump_no_collar',
    locationId: 'gate',
    singleFile: 'cat_jump_no_collar_v1.png',
    loop: 'FALSE',
    preloadPriority: '1',
    notes: 'Phase 1 real art — Gate transition hop, no collar (naming has not happened yet).',
  },
];

function requiredFilenames(spec: SceneAssetSeedRowSpec): string[] {
  return [spec.desktopFile, spec.mobileFile, spec.singleFile].filter(
    (f): f is string => typeof f === 'string',
  );
}

export interface DiscoveredFile {
  filename: string;
  fileId: string;
  mimeType: string;
  size: number | null;
}

export type DiscoveryIssueKind = 'missing' | 'ambiguous' | 'unsupported_mime' | 'unknown_size';

export interface DiscoveryIssue {
  filename: string;
  issue: DiscoveryIssueKind;
  detail?: string;
}

export interface DiscoveryResult {
  found: Map<string, DiscoveredFile>;
  issues: DiscoveryIssue[];
}

/**
 * Discovers, by exact filename, every Drive file this handoff's 16 assets
 * need — read-only, via `DriveGateway.findUniqueUnderRoot` (exact-name
 * search + full ancestry containment proof). Never guesses: a name with no
 * match under the root, or more than one, is reported as an issue rather
 * than silently picked. MIME/size are validated here too, so a caller only
 * ever sees `found` entries that are actually safe to register as an image
 * asset.
 */
export async function discoverPhase1SceneAssetFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<DiscoveryResult> {
  const filenames = Array.from(new Set(SCENE_CHARACTER_ASSET_SEED_ROWS.flatMap(requiredFilenames)));
  const found = new Map<string, DiscoveredFile>();
  const issues: DiscoveryIssue[] = [];

  for (const filename of filenames) {
    const result = await driveGateway.findUniqueUnderRoot(filename, rootFolderId);
    if (result.kind === 'missing') {
      issues.push({ filename, issue: 'missing' });
      continue;
    }
    if (result.kind === 'ambiguous') {
      issues.push({
        filename,
        issue: 'ambiguous',
        detail: `${result.matches.length} files with this exact name are registered under the asset root`,
      });
      continue;
    }
    const meta = result.metadata;
    if (!isAllowedMimeForFamily('image', meta.mimeType)) {
      issues.push({ filename, issue: 'unsupported_mime', detail: meta.mimeType });
      continue;
    }
    if (meta.size === null) {
      issues.push({ filename, issue: 'unknown_size' });
      continue;
    }
    found.set(filename, { filename, fileId: meta.id, mimeType: meta.mimeType, size: meta.size });
  }

  return { found, issues };
}

export interface SceneAssetSeedOutcome extends SeedOutcome {
  /** An asset whose required file(s) weren't all cleanly discovered — never partially registered. */
  blocked: Array<{ assetId: string; reasons: string[] }>;
}

/**
 * Discovers the 16 files by name, then idempotently upserts every asset
 * whose required file(s) were all found/validated — mirroring
 * `phase1-map-assets-seed.service.ts`'s exact upsert shape (only the
 * seed's own columns are ever patched, `version` is set only on first
 * creation). An asset with any missing/ambiguous/invalid required file is
 * skipped entirely and reported in `blocked`, never partially written.
 */
export async function seedPhase1SceneCharacterAssets(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{ discovery: DiscoveryResult; outcome: SceneAssetSeedOutcome }> {
  const discovery = await discoverPhase1SceneAssetFiles(driveGateway, rootFolderId);
  const outcome: SceneAssetSeedOutcome = { created: [], updated: [], unchanged: [], blocked: [] };

  for (const spec of SCENE_CHARACTER_ASSET_SEED_ROWS) {
    const reasons: string[] = [];
    for (const filename of requiredFilenames(spec)) {
      if (discovery.found.has(filename)) continue;
      const issue = discovery.issues.find((i) => i.filename === filename);
      reasons.push(
        `${filename}: ${issue?.issue ?? 'unknown'}${issue?.detail ? ` (${issue.detail})` : ''}`,
      );
    }
    if (reasons.length > 0) {
      outcome.blocked.push({ assetId: spec.assetId, reasons });
      continue;
    }

    const driveFileId = spec.desktopFile
      ? discovery.found.get(spec.desktopFile)!.fileId
      : discovery.found.get(spec.singleFile!)!.fileId;
    const mobileFileId = spec.mobileFile ? discovery.found.get(spec.mobileFile)!.fileId : '';

    const existing = await gateway.findByPrimaryKey('10_ASSETS', spec.assetId, { bypass: true });
    const desiredPatch: Record<string, string> = {
      asset_type: 'image',
      location_id: spec.locationId,
      drive_file_id: driveFileId,
      mobile_drive_file_id: mobileFileId,
      poster_drive_file_id: '',
      loop: spec.loop,
      preload_priority: spec.preloadPriority,
      enabled: 'TRUE',
      notes: spec.notes,
    };

    if (!existing) {
      await gateway.appendRow('10_ASSETS', {
        asset_id: spec.assetId,
        version: '1',
        ...desiredPatch,
      });
      outcome.created.push(spec.assetId);
      continue;
    }

    const changedPatch: Record<string, string> = {};
    for (const [column, value] of Object.entries(desiredPatch)) {
      if ((existing.row.raw[column] ?? '') !== value) {
        changedPatch[column] = value;
      }
    }

    if (Object.keys(changedPatch).length === 0) {
      outcome.unchanged.push(spec.assetId);
      continue;
    }

    await gateway.updateByPrimaryKey('10_ASSETS', spec.assetId, changedPatch);
    outcome.updated.push(spec.assetId);
  }

  return { discovery, outcome };
}
