import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * birthday_2026 art registration. Every file is discovered by exact filename under the configured
 * Drive asset root (read-only, unique name, image MIME); no Drive file id is hard-coded. Logical
 * asset ids are stable and reused from `apps/functions/src/world/birthday.ts`'s `ASSET_IDS`; the
 * garden is ONE scene asset with a desktop file and a portrait (`mobile_drive_file_id`) variant,
 * matching the convention every other scene background uses (see `phase2-art-assets-seed.service.ts`).
 *
 * Idempotent: a new row starts at `version` 1; an existing row is only patched when its media
 * actually differs, and that bumps `version` by one. A second run changes nothing.
 */
export interface BirthdayAssetSpec {
  assetId: string;
  file: string;
  mobileFile?: string;
  notes: string;
}

export const BIRTHDAY_ASSET_SPECS: readonly BirthdayAssetSpec[] = [
  {
    assetId: 'birthday_garden',
    file: 'birthday_garden_desktop_v1.png',
    mobileFile: 'birthday_garden_mobile_v1.png',
    notes: 'birthday_2026 Cottage garden celebration scene (desktop + portrait variant).',
  },
  {
    assetId: 'birthday_cake',
    file: 'birthday_cake_base_v2.png',
    notes: 'birthday_2026 cake (v2, approved reference, no candles baked in).',
  },
  {
    assetId: 'birthday_cottage_decoration',
    file: 'birthday_sunflower_decoration_v1.png',
    notes:
      'birthday_2026 permanent Cottage decoration (granted via claimGifts, placed via /cottage/decor).',
  },
  {
    assetId: 'birthday_candle_unlit',
    file: 'birthday_candle_unlit_v1.png',
    notes: 'birthday_2026 candle body — the client instantiates this three times on the cake.',
  },
  {
    assetId: 'birthday_candle_flame',
    file: 'birthday_candle_flame_v1.png',
    notes:
      'birthday_2026 flame overlay — the client instantiates this three times, one per candle.',
  },
];

/** The achievement badge goes through the ordinary icon convention (09_ICONS + 10_ASSETS), exactly
 * like every other achievement icon — not a raw asset id in `birthday.ts`. */
export const BIRTHDAY_ICON_SPEC = {
  iconId: 'birthday_2026_celebrated_icon',
  assetId: 'asset_birthday_2026_celebrated_icon',
  file: 'birthday_achievement_badge_v1.png',
  achievementId: 'birthday_2026_celebrated',
  displayName: 'Birthday celebrated badge',
} as const;

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

export function allBirthdayFilenames(): string[] {
  const names = new Set<string>();
  for (const s of BIRTHDAY_ASSET_SPECS) {
    names.add(s.file);
    if (s.mobileFile) names.add(s.mobileFile);
  }
  names.add(BIRTHDAY_ICON_SPEC.file);
  return [...names];
}

export async function discoverBirthdayArtFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{ found: Map<string, DiscoveredArtFile>; issues: DiscoveryIssue[] }> {
  const found = new Map<string, DiscoveredArtFile>();
  const issues: DiscoveryIssue[] = [];
  for (const filename of allBirthdayFilenames()) {
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

export interface BirthdaySeedOutcome {
  created: string[];
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
  outcome: BirthdaySeedOutcome,
  assetId: string,
  desired: { driveFileId: string; mobileFileId: string; notes: string },
): Promise<void> {
  const raw = assets.get(assetId);
  if (!raw) {
    const row = {
      asset_id: assetId,
      asset_type: 'image',
      location_id: 'cottage',
      scene_id: '',
      drive_file_id: desired.driveFileId,
      mobile_drive_file_id: desired.mobileFileId,
      poster_drive_file_id: '',
      preload_priority: '2',
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

export async function seedBirthdayArtAssets(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{
  discovery: Awaited<ReturnType<typeof discoverBirthdayArtFiles>>;
  outcome: BirthdaySeedOutcome;
}> {
  const discovery = await discoverBirthdayArtFiles(driveGateway, rootFolderId);
  const outcome: BirthdaySeedOutcome = { created: [], updated: [], unchanged: [], blocked: [] };
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

  for (const spec of BIRTHDAY_ASSET_SPECS) {
    const reasons = missing([spec.file, ...(spec.mobileFile ? [spec.mobileFile] : [])]);
    if (reasons.length > 0) {
      outcome.blocked.push({ id: spec.assetId, reasons });
      continue;
    }
    await upsertAsset(gateway, assets, outcome, spec.assetId, {
      driveFileId: discovery.found.get(spec.file)!.fileId,
      mobileFileId: spec.mobileFile ? discovery.found.get(spec.mobileFile)!.fileId : '',
      notes: spec.notes,
    });
  }

  const iconReasons = missing([BIRTHDAY_ICON_SPEC.file]);
  if (iconReasons.length > 0) {
    outcome.blocked.push({ id: BIRTHDAY_ICON_SPEC.iconId, reasons: iconReasons });
  } else {
    await upsertAsset(gateway, assets, outcome, BIRTHDAY_ICON_SPEC.assetId, {
      driveFileId: discovery.found.get(BIRTHDAY_ICON_SPEC.file)!.fileId,
      mobileFileId: '',
      notes: 'birthday_2026 achievement badge icon.',
    });

    const iconRow = icons.get(BIRTHDAY_ICON_SPEC.iconId);
    if (!iconRow) {
      const row = {
        icon_id: BIRTHDAY_ICON_SPEC.iconId,
        category: 'achievement',
        display_name: BIRTHDAY_ICON_SPEC.displayName,
        asset_id: BIRTHDAY_ICON_SPEC.assetId,
        format: 'png',
        rtl_mirror: 'FALSE',
        alt_text_id: '',
        width_px: '256',
        height_px: '256',
        enabled: 'TRUE',
        version: '1',
      };
      await quota(() => gateway.appendRow('09_ICONS', row));
      icons.set(BIRTHDAY_ICON_SPEC.iconId, row);
      outcome.created.push(`09_ICONS.${BIRTHDAY_ICON_SPEC.iconId}`);
    } else if ((iconRow.format ?? '') !== 'png') {
      const current = Number.parseInt(iconRow.version ?? '', 10);
      const version = String((Number.isFinite(current) ? current : 0) + 1);
      await quota(() =>
        gateway.updateByPrimaryKey('09_ICONS', BIRTHDAY_ICON_SPEC.iconId, {
          format: 'png',
          version,
        }),
      );
      Object.assign(iconRow, { format: 'png', version });
      outcome.updated.push({
        id: BIRTHDAY_ICON_SPEC.iconId,
        tab: '09_ICONS',
        columns: ['format', 'version'],
        version,
      });
    } else {
      outcome.unchanged.push(`09_ICONS.${BIRTHDAY_ICON_SPEC.iconId}`);
    }

    const ach = achievements.get(BIRTHDAY_ICON_SPEC.achievementId);
    const achIconMissing = ach && (isPlaceholder(ach.icon_id) || (ach.icon_id ?? '').trim() === '');
    if (ach && achIconMissing) {
      await quota(() =>
        gateway.updateByPrimaryKey('23_ACHIEVEMENTS', BIRTHDAY_ICON_SPEC.achievementId, {
          icon_id: BIRTHDAY_ICON_SPEC.iconId,
        }),
      );
      ach.icon_id = BIRTHDAY_ICON_SPEC.iconId;
      outcome.updated.push({
        id: BIRTHDAY_ICON_SPEC.achievementId,
        tab: '23_ACHIEVEMENTS',
        columns: ['icon_id'],
      });
    } else if (ach) {
      outcome.unchanged.push(`23_ACHIEVEMENTS.${BIRTHDAY_ICON_SPEC.achievementId}`);
    } else {
      outcome.blocked.push({
        id: BIRTHDAY_ICON_SPEC.achievementId,
        reasons: ['23_ACHIEVEMENTS row not found (icon registered, mapping not applied)'],
      });
    }
  }

  return { discovery, outcome };
}
