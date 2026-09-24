import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * Phase 2 art registration. Every file is discovered by exact filename under the
 * configured Drive asset root (read-only, full ancestry containment proof, unique
 * name, image MIME); no Drive file id is hard-coded. Logical asset ids and icon ids
 * are stable: `key_candle` keeps its ids and simply points at the cross artwork.
 *
 * Idempotent: a new row starts at `version` 1; an existing row is only patched when
 * its media (asset type or Drive file) actually differs, and that bumps `version`
 * by one. A second run changes nothing. Unrelated rows/columns are never touched.
 */
export interface Phase2AssetSpec {
  assetId: string;
  locationId: string;
  file: string;
  mobileFile?: string;
  notes: string;
}

const scene = (assetId: string, locationId: string, desktop: string, mobile: string) => ({
  assetId,
  locationId,
  file: desktop,
  mobileFile: mobile,
  notes: 'Phase 2 scene painting (desktop + portrait variant).',
});
const single = (assetId: string, locationId: string, file: string, what: string) => ({
  assetId,
  locationId,
  file,
  notes: `Phase 2 ${what}.`,
});

export const PHASE2_ASSET_SPECS: readonly Phase2AssetSpec[] = [
  scene(
    'junction_scene',
    'junction',
    'junction_scene_desktop_v1.png',
    'junction_scene_mobile_v1.png',
  ),
  scene(
    'church_interior_scene',
    'church',
    'church_interior_scene_desktop_v1.png',
    'church_interior_scene_mobile_v1.png',
  ),
  scene(
    'cafe_exterior_scene',
    'cafe',
    'cafe_exterior_scene_desktop_v1.png',
    'cafe_exterior_scene_mobile_v1.png',
  ),
  scene(
    'cafe_interior_scene',
    'cafe',
    'cafe_interior_scene_desktop_v1.png',
    'cafe_interior_scene_mobile_v1.png',
  ),
  scene(
    'arcade_exterior_scene',
    'arcade',
    'arcade_exterior_scene_desktop_v1.png',
    'arcade_exterior_scene_mobile_v1.png',
  ),
  scene(
    'arcade_interior_scene',
    'arcade',
    'arcade_interior_scene_desktop_v2.png',
    'arcade_interior_scene_mobile_v2.png',
  ),
  scene(
    'cottage_exterior_scene',
    'cottage',
    'cottage_exterior_scene_desktop_v1.png',
    'cottage_exterior_scene_mobile_v1.png',
  ),
  scene(
    'cottage_interior_scene',
    'cottage',
    'cottage_interior_scene_desktop_v2.png',
    'cottage_interior_scene_mobile_v2.png',
  ),
  scene(
    'farm_exterior_scene',
    'farm',
    'farm_exterior_scene_desktop_v1.png',
    'farm_exterior_scene_mobile_v1.png',
  ),
  scene(
    'museum_exterior_scene',
    'museum',
    'museum_exterior_scene_desktop_v1.png',
    'museum_exterior_scene_mobile_v1.png',
  ),
  scene(
    'museum_hall_scene',
    'museum',
    'museum_hall_scene_desktop_v2.png',
    'museum_hall_scene_mobile_v2.png',
  ),
  single('marcelino_idle', 'cottage', 'marcelino_idle_v1.png', 'Marcelino pose'),
  single('marcelino_mailbag', 'cottage', 'marcelino_mailbag_v1.png', 'Marcelino pose'),
  single('marcelino_run_away', 'cottage', 'marcelino_run_away_v1.png', 'Marcelino pose'),
  single('walkman_player', 'cafe', 'walkman_player_v1.png', 'Walkman prop'),
  single('candle_unlit', 'church', 'candle_unlit_v1.png', 'candle prop'),
  single('candle_lit', 'church', 'candle_lit_v1.png', 'candle prop'),
  single('museum_artifact', 'museum', 'museum_artifact_v1.png', 'museum artifact prop'),
  ...['sunflower', 'mango', 'blueberry'].flatMap((crop) =>
    [
      ['ready', 'v1'],
      ['growing', 'v1'],
      ['planted', 'v1'],
      ['wilted', crop === 'sunflower' ? 'v1' : 'v2'],
    ].map(([state, v]) =>
      single(
        `crop_${crop}_${state}`,
        'farm',
        `crop_${crop}_${state}_${v}.png`,
        'crop stage sprite',
      ),
    ),
  ),
  ...['idle', 'walking', 'arrival'].map((pose) =>
    single(`map_avatar_${pose}`, 'map', `map_avatar_${pose}_v3.png`, 'map avatar pose'),
  ),
];

export interface Phase2IconSpec {
  iconId: string;
  assetId: string;
  file: string;
  category: 'key' | 'farm' | 'achievement';
  displayName: string;
  /** Existing rows (keys) keep their alt text; new rows use this text id when set. */
  altTextId?: string;
  /** Existing keys are updated in place (asset row + icon row); the rest are appended. */
  existingKey?: boolean;
  /** An achievement whose placeholder `icon_id` gets replaced by `iconId`. */
  achievementId?: string;
}

const KEYS: Array<[string, string]> = [
  ['shell', 'key_shell_v1.png'],
  ['candle', 'key_church_cross_v1.png'],
  ['music', 'key_music_v1.png'],
  ['token', 'key_token_v1.png'],
  ['letter', 'key_letter_v1.png'],
  ['sunflower', 'key_sunflower_v1.png'],
  ['everkeep', 'key_everkeep_v1.png'],
];
const ACHIEVEMENTS: Array<[string, string]> = [
  ['first_step', 'ach_first_step'],
  ['perfect_quiz', 'ach_perfect_quiz'],
  ['first_harvest', 'ach_first_harvest'],
  ['secret_001', 'ach_secret_001'],
];

export const PHASE2_ICON_SPECS: readonly Phase2IconSpec[] = [
  ...KEYS.map(([key, file]) => ({
    iconId: `key_${key}_icon`,
    assetId: `asset_key_${key}_icon`,
    file,
    category: 'key' as const,
    displayName: `Key ${key}`,
    existingKey: true,
  })),
  ...['sunflower', 'mango', 'blueberry'].flatMap((crop) => [
    {
      iconId: `seed_${crop}_icon`,
      assetId: `asset_seed_${crop}_icon`,
      file: `seed_${crop}_icon_v1.png`,
      category: 'farm' as const,
      displayName: `Seed ${crop}`,
      altTextId: `crop_${crop}_name`,
    },
    {
      iconId: `crop_${crop}_icon`,
      assetId: `asset_crop_${crop}_icon`,
      file: `crop_${crop}_icon_v1.png`,
      category: 'farm' as const,
      displayName: `Crop ${crop}`,
      altTextId: `crop_${crop}_name`,
    },
  ]),
  ...ACHIEVEMENTS.map(([id, achievementId]) => ({
    iconId: `ach_${id}_icon`,
    assetId: `asset_achievement_${id}`,
    file: `achievement_${id}_v1.png`,
    category: 'achievement' as const,
    displayName: `Achievement ${id}`,
    altTextId: `${achievementId}_title`,
    achievementId,
  })),
];

export interface DiscoveredArtFile {
  filename: string;
  fileId: string;
  mimeType: string;
}
export interface DiscoveryIssue {
  filename: string;
  issue: 'missing' | 'ambiguous' | 'unsupported_mime' | 'not_png';
  detail?: string;
}

export function allPhase2Filenames(): string[] {
  const names = new Set<string>();
  for (const s of PHASE2_ASSET_SPECS) {
    names.add(s.file);
    if (s.mobileFile) names.add(s.mobileFile);
  }
  for (const s of PHASE2_ICON_SPECS) names.add(s.file);
  return [...names];
}

export async function discoverPhase2ArtFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{ found: Map<string, DiscoveredArtFile>; issues: DiscoveryIssue[] }> {
  const found = new Map<string, DiscoveredArtFile>();
  const issues: DiscoveryIssue[] = [];
  for (const filename of allPhase2Filenames()) {
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

export interface Phase2SeedOutcome {
  created: string[];
  /** Existing rows whose media changed (version bumped) or whose placeholder was replaced. */
  updated: Array<{ id: string; tab: string; columns: string[]; version?: string }>;
  unchanged: string[];
  blocked: Array<{ id: string; reasons: string[] }>;
}

type RawRow = Record<string, string>;
type Snapshot = Map<string, RawRow>;

async function snapshot(
  gateway: SheetGateway,
  tab: '10_ASSETS' | '09_ICONS' | '23_ACHIEVEMENTS',
  key: string,
): Promise<Snapshot> {
  const parsed = await gateway.readTab(tab, { bypass: true });
  return new Map(parsed.rows.map((r) => [r.raw[key] ?? '', { ...r.raw }]));
}

/** Retries a Sheets call that hit the per-minute quota, waiting out the window. */
async function quota<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'SHEET_RATE_LIMITED' || attempt >= 6) throw err;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
}

function isPlaceholder(v: string | undefined): boolean {
  const t = (v ?? '').trim();
  return t.startsWith('<') && t.endsWith('>');
}

/** Upserts one `10_ASSETS` row; returns what happened. Version bumps only on a media change. */
async function upsertAsset(
  gateway: SheetGateway,
  assets: Snapshot,
  outcome: Phase2SeedOutcome,
  assetId: string,
  desired: {
    locationId: string;
    driveFileId: string;
    mobileFileId: string;
    notes: string;
    preload: string;
  },
): Promise<void> {
  const raw = assets.get(assetId);
  if (!raw) {
    const row = {
      asset_id: assetId,
      asset_type: 'image',
      location_id: desired.locationId,
      scene_id: '',
      drive_file_id: desired.driveFileId,
      mobile_drive_file_id: desired.mobileFileId,
      poster_drive_file_id: '',
      preload_priority: desired.preload,
      loop: 'FALSE',
      enabled: 'TRUE',
      version: '1',
      notes: desired.notes,
    };
    await quota(() => gateway.appendRow('10_ASSETS', row));
    assets.set(assetId, row);
    outcome.created.push(`10_ASSETS.${assetId}`);
    return;
  }
  const patch: Record<string, string> = {};
  if ((raw.asset_type ?? '') !== 'image') patch.asset_type = 'image';
  if ((raw.drive_file_id ?? '') !== desired.driveFileId) patch.drive_file_id = desired.driveFileId;
  if ((raw.mobile_drive_file_id ?? '') !== desired.mobileFileId) {
    patch.mobile_drive_file_id = desired.mobileFileId;
  }
  if (Object.keys(patch).length === 0) {
    outcome.unchanged.push(`10_ASSETS.${assetId}`);
    return;
  }
  const current = Number.parseInt(raw.version ?? '', 10);
  patch.version = String((Number.isFinite(current) ? current : 0) + 1);
  await quota(() => gateway.updateByPrimaryKey('10_ASSETS', assetId, patch));
  Object.assign(raw, patch);
  outcome.updated.push({
    id: assetId,
    tab: '10_ASSETS',
    columns: Object.keys(patch),
    version: patch.version,
  });
}

export async function seedPhase2ArtAssets(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{
  discovery: Awaited<ReturnType<typeof discoverPhase2ArtFiles>>;
  outcome: Phase2SeedOutcome;
}> {
  const discovery = await discoverPhase2ArtFiles(driveGateway, rootFolderId);
  const outcome: Phase2SeedOutcome = { created: [], updated: [], unchanged: [], blocked: [] };
  const assets = await quota(() => snapshot(gateway, '10_ASSETS', 'asset_id'));
  const icons = await quota(() => snapshot(gateway, '09_ICONS', 'icon_id'));
  const achievements = await quota(() => snapshot(gateway, '23_ACHIEVEMENTS', 'achievement_id'));
  const missing = (files: string[]): string[] =>
    files
      .filter((f) => !discovery.found.has(f))
      .map((f) => {
        const i = discovery.issues.find((x) => x.filename === f);
        return `${f}: ${i?.issue ?? 'unknown'}${i?.detail ? ` (${i.detail})` : ''}`;
      });

  for (const spec of PHASE2_ASSET_SPECS) {
    const reasons = missing([spec.file, ...(spec.mobileFile ? [spec.mobileFile] : [])]);
    if (reasons.length > 0) {
      outcome.blocked.push({ id: spec.assetId, reasons });
      continue;
    }
    await upsertAsset(gateway, assets, outcome, spec.assetId, {
      locationId: spec.locationId,
      driveFileId: discovery.found.get(spec.file)!.fileId,
      mobileFileId: spec.mobileFile ? discovery.found.get(spec.mobileFile)!.fileId : '',
      notes: spec.notes,
      preload: spec.mobileFile ? '1' : '2',
    });
  }

  for (const spec of PHASE2_ICON_SPECS) {
    const reasons = missing([spec.file]);
    if (reasons.length > 0) {
      outcome.blocked.push({ id: spec.iconId, reasons });
      continue;
    }
    await upsertAsset(gateway, assets, outcome, spec.assetId, {
      locationId: '',
      driveFileId: discovery.found.get(spec.file)!.fileId,
      mobileFileId: '',
      notes: `Phase 2 ${spec.category} icon.`,
      preload: '2',
    });

    const iconRow = icons.get(spec.iconId);
    if (!iconRow) {
      const row = {
        icon_id: spec.iconId,
        category: spec.category === 'key' ? 'key' : spec.category,
        display_name: spec.displayName,
        asset_id: spec.assetId,
        format: 'png',
        rtl_mirror: 'FALSE',
        alt_text_id: spec.altTextId ?? '',
        width_px: '256',
        height_px: '256',
        enabled: 'TRUE',
        version: '1',
      };
      await quota(() => gateway.appendRow('09_ICONS', row));
      icons.set(spec.iconId, row);
      outcome.created.push(`09_ICONS.${spec.iconId}`);
    } else if ((iconRow.format ?? '') !== 'png') {
      // Only the format changes (svg -> png); the row's ids, alt text and dimensions are kept.
      const current = Number.parseInt(iconRow.version ?? '', 10);
      const version = String((Number.isFinite(current) ? current : 0) + 1);
      await quota(() =>
        gateway.updateByPrimaryKey('09_ICONS', spec.iconId, { format: 'png', version }),
      );
      Object.assign(iconRow, { format: 'png', version });
      outcome.updated.push({
        id: spec.iconId,
        tab: '09_ICONS',
        columns: ['format', 'version'],
        version,
      });
    } else {
      outcome.unchanged.push(`09_ICONS.${spec.iconId}`);
    }

    if (spec.achievementId) {
      const ach = achievements.get(spec.achievementId);
      if (ach && isPlaceholder(ach.icon_id)) {
        await quota(() =>
          gateway.updateByPrimaryKey('23_ACHIEVEMENTS', spec.achievementId!, {
            icon_id: spec.iconId,
          }),
        );
        ach.icon_id = spec.iconId;
        outcome.updated.push({
          id: spec.achievementId,
          tab: '23_ACHIEVEMENTS',
          columns: ['icon_id'],
        });
      } else if (ach) {
        outcome.unchanged.push(`23_ACHIEVEMENTS.${spec.achievementId}`);
      } else {
        outcome.blocked.push({
          id: spec.achievementId,
          reasons: ['23_ACHIEVEMENTS row not found (icon registered, mapping not applied)'],
        });
      }
    }
  }

  return { discovery, outcome };
}
