import type { SheetGateway } from '../repositories/sheet-gateway.js';
import type { SeedOutcome } from './access-config-seed.service.js';

/**
 * The two existing map-composition assets Ahmed already supplied, registered
 * through `10_ASSETS` for Phase 1 item B. `location_id: 'map'` is the
 * already-accepted controlled-list value used for map-only assets (see
 * `packages/test-fixtures`'s `39_VALIDATION_LISTS` location list). The ocean
 * poster is registered as `map_ocean_loop`'s `poster_drive_file_id` variant
 * — reusing the M03-B1 media gateway's existing poster-variant mechanism —
 * rather than as a third, redundant asset row.
 *
 * These are real Drive file IDs Ahmed provided directly in the current
 * instruction, not invented content; nothing here embeds them in frontend
 * source or in any API response (the media gateway never returns a raw
 * Drive file ID, per M03-B1).
 */
export interface MapAssetSeedRowSpec {
  asset_id: string;
  asset_type: 'image' | 'video';
  location_id: string;
  drive_file_id: string;
  mobile_drive_file_id?: string;
  poster_drive_file_id?: string;
  loop: 'TRUE' | 'FALSE';
  preload_priority: string;
  notes: string;
}

export const MAP_ASSET_SEED_ROWS: MapAssetSeedRowSpec[] = [
  {
    asset_id: 'map_island_transparent',
    asset_type: 'image',
    location_id: 'map',
    drive_file_id: '1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8',
    loop: 'FALSE',
    preload_priority: '1',
    notes:
      'Phase 1 developer live-map composition preview only — transparent island overlay, not the real Map (locked until M14).',
  },
  {
    asset_id: 'map_ocean_loop',
    asset_type: 'video',
    location_id: 'map',
    drive_file_id: '1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo',
    poster_drive_file_id: '1de1aBHsIG3PEso7WMALHKIaAVPNberMt',
    loop: 'TRUE',
    preload_priority: '1',
    notes:
      'Phase 1 developer live-map composition preview only — top-down ocean loop, map-only per the Living Bible (not the eye-level Beach ocean).',
  },
];

/**
 * Idempotently upserts the Phase 1 map-composition rows into `10_ASSETS`,
 * keyed by the stable `asset_id` primary key. Only the fields this seed
 * owns are ever patched (never the whole row), so unknown columns already
 * present on an existing row — and any other row entirely — are preserved
 * untouched. A version bump is intentionally NOT applied automatically on an
 * unrelated-field drift: `version` is only set on first creation, matching
 * the media gateway's exact-version-match contract (bumping it here on a
 * routine re-run would invalidate every already-cached client URL for no
 * reason).
 */
export async function seedPhase1MapAssets(gateway: SheetGateway): Promise<SeedOutcome> {
  const outcome: SeedOutcome = { created: [], updated: [], unchanged: [] };

  for (const spec of MAP_ASSET_SEED_ROWS) {
    const existing = await gateway.findByPrimaryKey('10_ASSETS', spec.asset_id, { bypass: true });

    const desiredPatch: Record<string, string> = {
      asset_type: spec.asset_type,
      location_id: spec.location_id,
      drive_file_id: spec.drive_file_id,
      mobile_drive_file_id: spec.mobile_drive_file_id ?? '',
      poster_drive_file_id: spec.poster_drive_file_id ?? '',
      loop: spec.loop,
      preload_priority: spec.preload_priority,
      enabled: 'TRUE',
      notes: spec.notes,
    };

    if (!existing) {
      await gateway.appendRow('10_ASSETS', {
        asset_id: spec.asset_id,
        version: '1',
        ...desiredPatch,
      });
      outcome.created.push(spec.asset_id);
      continue;
    }

    const changedPatch: Record<string, string> = {};
    for (const [column, value] of Object.entries(desiredPatch)) {
      if ((existing.row.raw[column] ?? '') !== value) {
        changedPatch[column] = value;
      }
    }

    if (Object.keys(changedPatch).length === 0) {
      outcome.unchanged.push(spec.asset_id);
      continue;
    }

    await gateway.updateByPrimaryKey('10_ASSETS', spec.asset_id, changedPatch);
    outcome.updated.push(spec.asset_id);
  }

  return outcome;
}
