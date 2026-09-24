import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * Registers the story-gallery paintings from `assets/Veoulla_Content_Banks_v1/asset_manifest.json`
 * (discovered by exact filename under the approved Drive root — never uploaded, never a guessed
 * Drive id) into `10_ASSETS`, then links each image to its story's `30_CHURCH_CONTENT.image_asset_ids`
 * cell — on every locale row that shares that story's `content_id`, since `image_asset_ids` is a
 * per-locale-row cell, not a per-`content_id` one. Same discover-then-upsert shape as
 * `church-audio-media-seed.service.ts`; the caller supplies the specs (read from the manifest file),
 * this file never embeds or invents them.
 */
export interface ChurchStoryImageSpec {
  assetId: string;
  storyId: string;
  filename: string;
  mimeType: string;
}

export interface DiscoveredImageFile {
  filename: string;
  fileId: string;
  mimeType: string;
}
export interface ImageDiscoveryIssue {
  filename: string;
  issue: 'missing' | 'ambiguous' | 'unsupported_mime';
  detail?: string;
}

/** Read-only: discovers each file by exact filename under the configured Drive asset root. Never uploads. */
export async function discoverChurchStoryImageFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
  specs: readonly ChurchStoryImageSpec[],
): Promise<{ found: Map<string, DiscoveredImageFile>; issues: ImageDiscoveryIssue[] }> {
  const found = new Map<string, DiscoveredImageFile>();
  const issues: ImageDiscoveryIssue[] = [];
  for (const spec of specs) {
    const result = await driveGateway.findUniqueUnderRoot(spec.filename, rootFolderId);
    if (result.kind === 'missing') {
      issues.push({ filename: spec.filename, issue: 'missing' });
    } else if (result.kind === 'ambiguous') {
      issues.push({
        filename: spec.filename,
        issue: 'ambiguous',
        detail: `${result.matches.length} matches`,
      });
    } else if (!isAllowedMimeForFamily('image', result.metadata.mimeType)) {
      issues.push({
        filename: spec.filename,
        issue: 'unsupported_mime',
        detail: result.metadata.mimeType,
      });
    } else {
      found.set(spec.filename, {
        filename: spec.filename,
        fileId: result.metadata.id,
        mimeType: result.metadata.mimeType,
      });
    }
  }
  return { found, issues };
}

export interface ImageSeedOutcome {
  created: string[];
  updated: Array<{ assetId: string; version: string }>;
  unchanged: string[];
  blocked: Array<{ assetId: string; storyId: string; filename: string; reasons: string[] }>;
  linked: Array<{ contentRowId: string; assetId: string }>;
  alreadyLinked: string[];
}

/**
 * Idempotently upserts one `10_ASSETS` row per discovered image, then patches
 * `30_CHURCH_CONTENT.image_asset_ids` on every content row sharing the story's `content_id`, only
 * where that cell is currently blank (never overwrites a value already set by hand).
 */
export async function seedChurchStoryImages(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
  specs: readonly ChurchStoryImageSpec[],
): Promise<{
  discovery: Awaited<ReturnType<typeof discoverChurchStoryImageFiles>>;
  outcome: ImageSeedOutcome;
}> {
  const discovery = await discoverChurchStoryImageFiles(driveGateway, rootFolderId, specs);
  const outcome: ImageSeedOutcome = {
    created: [],
    updated: [],
    unchanged: [],
    blocked: [],
    linked: [],
    alreadyLinked: [],
  };

  const assets = await gateway.readTab('10_ASSETS', { bypass: true });
  const assetsById = new Map(
    assets.rows.map((r) => [r.primaryKeyValue ?? '', { ...r.raw } as Record<string, string>]),
  );

  const linkableStoryIds = new Set<string>();
  for (const spec of specs) {
    const found = discovery.found.get(spec.filename);
    if (!found) {
      const issue = discovery.issues.find((i) => i.filename === spec.filename);
      outcome.blocked.push({
        assetId: spec.assetId,
        storyId: spec.storyId,
        filename: spec.filename,
        reasons: [
          `${spec.filename}: ${issue?.issue ?? 'unknown'}${issue?.detail ? ` (${issue.detail})` : ''}`,
        ],
      });
      continue;
    }
    const existing = assetsById.get(spec.assetId);
    if (!existing) {
      const row = {
        asset_id: spec.assetId,
        asset_type: 'image',
        location_id: 'church',
        scene_id: '',
        drive_file_id: found.fileId,
        mobile_drive_file_id: '',
        poster_drive_file_id: '',
        preload_priority: '5',
        loop: 'FALSE',
        enabled: 'TRUE',
        version: '1',
        notes: `Story gallery painting for ${spec.storyId} (assets/Veoulla_Content_Banks_v1).`,
      };
      await gateway.appendRow('10_ASSETS', row);
      assetsById.set(spec.assetId, row);
      outcome.created.push(spec.assetId);
      linkableStoryIds.add(spec.storyId);
      continue;
    }
    const patch: Record<string, string> = {};
    if ((existing.asset_type ?? '') !== 'image') patch.asset_type = 'image';
    if ((existing.drive_file_id ?? '') !== found.fileId) patch.drive_file_id = found.fileId;
    if (Object.keys(patch).length === 0) {
      outcome.unchanged.push(spec.assetId);
      linkableStoryIds.add(spec.storyId);
      continue;
    }
    const current = Number.parseInt(existing.version ?? '', 10);
    patch.version = String((Number.isFinite(current) ? current : 0) + 1);
    await gateway.updateByPrimaryKey('10_ASSETS', spec.assetId, patch);
    Object.assign(existing, patch);
    outcome.updated.push({ assetId: spec.assetId, version: patch.version });
    linkableStoryIds.add(spec.storyId);
  }

  if (linkableStoryIds.size > 0) {
    const specByStoryId = new Map(specs.map((s) => [s.storyId, s]));
    const content = await gateway.readTab('30_CHURCH_CONTENT', { bypass: true });
    for (const row of content.rows) {
      const storyId = row.raw.content_id ?? '';
      if (!linkableStoryIds.has(storyId)) continue;
      const spec = specByStoryId.get(storyId);
      if (!spec) continue;
      const rowId = row.primaryKeyValue ?? '';
      const current = row.raw.image_asset_ids ?? '';
      if (current.trim() !== '') {
        outcome.alreadyLinked.push(rowId);
        continue;
      }
      await gateway.updateByPrimaryKey('30_CHURCH_CONTENT', rowId, {
        image_asset_ids: spec.assetId,
      });
      outcome.linked.push({ contentRowId: rowId, assetId: spec.assetId });
    }
  }

  return { discovery, outcome };
}
