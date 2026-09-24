import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  MAP_ASSET_SEED_ROWS,
  seedPhase1MapAssets,
} from '../src/services/phase1-map-assets-seed.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

describe('seedPhase1MapAssets', () => {
  it('creates both map asset rows on a workbook that has neither yet', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const outcome = await seedPhase1MapAssets(gateway);

    expect(outcome.created).toHaveLength(MAP_ASSET_SEED_ROWS.length);
    expect(outcome.updated).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(0);
  });

  it('registers map_island_transparent as an enabled image asset under the map location', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);

    const found = await gateway.findByPrimaryKey('10_ASSETS', 'map_island_transparent', {
      bypass: true,
    });
    expect(found).not.toBeNull();
    expect(found!.row.raw.asset_type).toBe('image');
    expect(found!.row.raw.location_id).toBe('map');
    expect(found!.row.raw.drive_file_id).toBe('1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8');
    expect(found!.row.raw.enabled).toBe('TRUE');
  });

  it('registers map_ocean_loop as a looping video with the ocean poster as its poster variant', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);

    const found = await gateway.findByPrimaryKey('10_ASSETS', 'map_ocean_loop', { bypass: true });
    expect(found).not.toBeNull();
    expect(found!.row.raw.asset_type).toBe('video');
    expect(found!.row.raw.drive_file_id).toBe('1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo');
    expect(found!.row.raw.poster_drive_file_id).toBe('1de1aBHsIG3PEso7WMALHKIaAVPNberMt');
    expect(found!.row.raw.loop).toBe('TRUE');
  });

  it('is idempotent: rerunning creates nothing new and reports everything unchanged', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);
    const afterFirstRun = await gateway.getRawTab('10_ASSETS', { bypass: true });

    const outcome = await seedPhase1MapAssets(gateway);
    expect(outcome.created).toHaveLength(0);
    expect(outcome.updated).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(MAP_ASSET_SEED_ROWS.length);

    const afterSecondRun = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(afterSecondRun.length).toBe(afterFirstRun.length);
  });

  it('never creates a duplicate row for the same asset_id across repeated runs', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);
    await seedPhase1MapAssets(gateway);
    await seedPhase1MapAssets(gateway);

    const raw = await gateway.getRawTab('10_ASSETS', { bypass: true });
    const header = raw[0]!;
    const idIdx = header.indexOf('asset_id');
    const ids = raw.slice(1).map((r) => r[idIdx]);
    const seededIds = ids.filter((id) => MAP_ASSET_SEED_ROWS.some((s) => s.asset_id === id));

    expect(new Set(seededIds).size).toBe(seededIds.length);
  });

  it('preserves every pre-existing 10_ASSETS row untouched', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.getRawTab('10_ASSETS', { bypass: true });

    await seedPhase1MapAssets(gateway);

    const after = await gateway.getRawTab('10_ASSETS', { bypass: true });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('updates a drifted map asset row back to the accepted value without duplicating it', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);
    await gateway.updateByPrimaryKey('10_ASSETS', 'map_island_transparent', {
      drive_file_id: 'drifted_value',
      enabled: 'FALSE',
    });

    const outcome = await seedPhase1MapAssets(gateway);
    expect(outcome.updated).toContain('map_island_transparent');

    const found = await gateway.findByPrimaryKey('10_ASSETS', 'map_island_transparent', {
      bypass: true,
    });
    expect(found!.row.raw.drive_file_id).toBe('1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8');
    expect(found!.row.raw.enabled).toBe('TRUE');
  });

  it('does not bump version on a routine unrelated re-run', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await seedPhase1MapAssets(gateway);
    const firstRun = await gateway.findByPrimaryKey('10_ASSETS', 'map_island_transparent', {
      bypass: true,
    });
    await seedPhase1MapAssets(gateway);
    const secondRun = await gateway.findByPrimaryKey('10_ASSETS', 'map_island_transparent', {
      bypass: true,
    });

    expect(secondRun!.row.raw.version).toBe(firstRun!.row.raw.version);
  });

  it('never reads or writes 02_USERS (Gate code / Admin password are untouched)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const usersBefore = await gateway.getRawTab('02_USERS', { bypass: true });

    await seedPhase1MapAssets(gateway);

    const usersAfter = await gateway.getRawTab('02_USERS', { bypass: true });
    expect(usersAfter).toEqual(usersBefore);
  });
});
