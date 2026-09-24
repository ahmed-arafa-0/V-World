import type { DriveGateway } from '../repositories/drive-gateway.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { isAllowedMimeForFamily } from './media-asset.service.js';

/**
 * Registers the 3 supplied audio files (discovered by exact filename under the approved Drive
 * root — never uploaded, never a guessed Drive id) into `10_ASSETS`, and the Café/Walkman song into
 * `20_SONGS`. Same discover-then-upsert shape as `church-candle-patch-assets-seed.service.ts`.
 *
 * - `Church Bell Sound Effect.mp3` → `audio_church_bell_exterior` (`location_id: 'church'`), a short
 *   one-shot played once on arrival at the Church exterior.
 * - `church.mp3` → `audio_church_gospel_reading` (`location_id: 'church'`) — the Gospel reading that
 *   replaces the (never-populated) hymn feature inside the Church interior/candle-corner views.
 * - `TUL8TE Wala Ash Wala Kan.mp3` → `asset_audio_song_tul8te_001` (`location_id: 'cafe'`), backing
 *   a new `song_tul8te_001` row in the Café/Walkman catalog. Title is taken verbatim from the
 *   filename (a fact, not an invented credit); artist/explanation are left blank rather than guessed.
 */
export interface ChurchAudioMediaSpec {
  assetId: string;
  filename: string;
  locationId: string;
  notes: string;
}

export const CHURCH_AUDIO_MEDIA_SPECS: readonly ChurchAudioMediaSpec[] = [
  {
    assetId: 'audio_church_bell_exterior',
    filename: 'Church Bell Sound Effect.mp3',
    locationId: 'church',
    notes: 'One-shot bell on arrival at the Church exterior (deduplicated per visit).',
  },
  {
    assetId: 'audio_church_gospel_reading',
    filename: 'church.mp3',
    locationId: 'church',
    notes:
      'Gospel reading replacing the hymn feature. Plays only in the Church interior/candle-corner views, starting at 5% volume; never restarts moving between those two views; fades out on leaving the Church.',
  },
  {
    assetId: 'asset_audio_song_tul8te_001',
    filename: 'TUL8TE Wala Ash Wala Kan.mp3',
    locationId: 'cafe',
    notes: 'Café/Walkman catalog addition. Title taken from filename; artist not supplied.',
  },
];

export function allChurchAudioMediaFilenames(): string[] {
  return CHURCH_AUDIO_MEDIA_SPECS.map((s) => s.filename);
}

export interface DiscoveredAudioFile {
  filename: string;
  fileId: string;
  mimeType: string;
}
export interface AudioDiscoveryIssue {
  filename: string;
  issue: 'missing' | 'ambiguous' | 'unsupported_mime';
  detail?: string;
}

/** Read-only: discovers each file by exact filename under the configured Drive asset root. Never uploads. */
export async function discoverChurchAudioMediaFiles(
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{ found: Map<string, DiscoveredAudioFile>; issues: AudioDiscoveryIssue[] }> {
  const found = new Map<string, DiscoveredAudioFile>();
  const issues: AudioDiscoveryIssue[] = [];
  for (const filename of allChurchAudioMediaFilenames()) {
    const result = await driveGateway.findUniqueUnderRoot(filename, rootFolderId);
    if (result.kind === 'missing') {
      issues.push({ filename, issue: 'missing' });
    } else if (result.kind === 'ambiguous') {
      issues.push({ filename, issue: 'ambiguous', detail: `${result.matches.length} matches` });
    } else if (!isAllowedMimeForFamily('audio', result.metadata.mimeType)) {
      issues.push({ filename, issue: 'unsupported_mime', detail: result.metadata.mimeType });
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

export interface AudioSeedOutcome {
  created: string[];
  updated: Array<{ assetId: string; version: string }>;
  unchanged: string[];
  blocked: Array<{ assetId: string; reasons: string[] }>;
  songCatalog: { created: string[]; existing: string[] };
}

/** Idempotently upserts the 3 `10_ASSETS` rows, then registers `song_tul8te_001` in `20_SONGS` only if its backing asset row exists. */
export async function seedChurchAudioMedia(
  gateway: SheetGateway,
  driveGateway: DriveGateway,
  rootFolderId: string,
): Promise<{
  discovery: Awaited<ReturnType<typeof discoverChurchAudioMediaFiles>>;
  outcome: AudioSeedOutcome;
}> {
  const discovery = await discoverChurchAudioMediaFiles(driveGateway, rootFolderId);
  const outcome: AudioSeedOutcome = {
    created: [],
    updated: [],
    unchanged: [],
    blocked: [],
    songCatalog: { created: [], existing: [] },
  };
  const assets = await gateway.readTab('10_ASSETS', { bypass: true });
  const byId = new Map(
    assets.rows.map((r) => [r.primaryKeyValue ?? '', { ...r.raw } as Record<string, string>]),
  );

  for (const spec of CHURCH_AUDIO_MEDIA_SPECS) {
    const found = discovery.found.get(spec.filename);
    if (!found) {
      const issue = discovery.issues.find((i) => i.filename === spec.filename);
      outcome.blocked.push({
        assetId: spec.assetId,
        reasons: [
          `${spec.filename}: ${issue?.issue ?? 'unknown'}${issue?.detail ? ` (${issue.detail})` : ''}`,
        ],
      });
      continue;
    }
    const existing = byId.get(spec.assetId);
    if (!existing) {
      const row = {
        asset_id: spec.assetId,
        asset_type: 'audio',
        location_id: spec.locationId,
        scene_id: '',
        drive_file_id: found.fileId,
        mobile_drive_file_id: '',
        poster_drive_file_id: '',
        preload_priority: '3',
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
    if ((existing.asset_type ?? '') !== 'audio') patch.asset_type = 'audio';
    if ((existing.drive_file_id ?? '') !== found.fileId) patch.drive_file_id = found.fileId;
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

  const songAssetRegistered =
    outcome.created.includes('asset_audio_song_tul8te_001') ||
    outcome.unchanged.includes('asset_audio_song_tul8te_001') ||
    outcome.updated.some((u) => u.assetId === 'asset_audio_song_tul8te_001');
  if (songAssetRegistered) {
    outcome.songCatalog = await gateway.appendRowsIfAbsent('20_SONGS', [
      {
        song_id: 'song_tul8te_001',
        title: 'Wala Ash Wala Kan',
        artist: '',
        release_at: '',
        location_id: 'cafe',
        audio_asset_id: 'asset_audio_song_tul8te_001',
        cover_asset_id: '',
        explanation_text_id: '',
        available_in_walkman: 'TRUE',
        enabled: 'TRUE',
        notes: 'Title taken from the supplied filename; artist not supplied by Ahmed yet.',
      },
    ]);
  }

  return { discovery, outcome };
}
