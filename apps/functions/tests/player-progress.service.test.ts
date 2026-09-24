import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  checkpointProgress,
  completeRoute,
  getPlayerProgress,
} from '../src/services/player-progress.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('checkpointProgress', () => {
  it('creates a new progress row for a user/route that has never checkpointed before', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await checkpointProgress(gateway, {
      userId: 'test_user_1',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });

    expect(result.applied).toBe(true);
    expect(result.reason).toBe('created');
    expect(result.progress.status).toBe('in_progress');
    expect(result.progress.currentBeatId).toBe('beat_01');
    expect(result.progress.lastCheckpointId).toBe('beat_01');
  });

  it('does not set last_checkpoint_id when checkpoint=false (a lighter beat update)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await checkpointProgress(gateway, {
      userId: 'test_user_2',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: false,
      now: NOW,
    });

    expect(result.progress.currentBeatId).toBe('beat_01');
    expect(result.progress.lastCheckpointId).toBe('');
  });

  it('is idempotent: writing the same beat twice does not create a duplicate row', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_3',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });
    await checkpointProgress(gateway, {
      userId: 'test_user_3',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });

    const raw = await gateway.getRawTab('24_PLAYER_PROGRESS', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_route_key');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'test_user_3|test_route');
    expect(matches).toHaveLength(1);
  });

  it('advances current_beat_id on a second, later checkpoint call', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_4',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });
    const second = await checkpointProgress(gateway, {
      userId: 'test_user_4',
      routeId: 'test_route',
      beatId: 'beat_02',
      checkpoint: true,
      now: new Date(NOW.getTime() + 60_000),
    });

    expect(second.progress.currentBeatId).toBe('beat_02');
    expect(second.progress.lastCheckpointId).toBe('beat_02');
  });

  it('survives a refresh: getPlayerProgress reads back exactly what was written', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_5',
      routeId: 'test_route',
      beatId: 'beat_03',
      checkpoint: true,
      currentLocation: 'beach',
      now: NOW,
    });

    const progress = await getPlayerProgress(gateway, 'test_user_5');
    expect(progress).toHaveLength(1);
    expect(progress[0]!.currentBeatId).toBe('beat_03');
    expect(progress[0]!.currentLocation).toBe('beach');
  });

  it("never returns another user's progress rows", async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_6',
      routeId: 'test_route',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });

    const otherUserProgress = await getPlayerProgress(gateway, 'someone_else');
    expect(otherUserProgress).toHaveLength(0);
  });
});

describe('completeRoute', () => {
  it('returns not_started when the route was never checkpointed', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await completeRoute(gateway, 'test_user_7', 'never_started_route', NOW);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('completes an in-progress route exactly once', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_8',
      routeId: 'test_route',
      beatId: 'beat_final',
      checkpoint: true,
      now: NOW,
    });

    const result = await completeRoute(gateway, 'test_user_8', 'test_route', NOW);
    expect(result.applied).toBe(true);
    expect(result.reason).toBe('completed');
    expect(result.progress!.status).toBe('completed');
  });

  it('is idempotent: completing an already-completed route is a safe no-op', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_9',
      routeId: 'test_route',
      beatId: 'beat_final',
      checkpoint: true,
      now: NOW,
    });
    await completeRoute(gateway, 'test_user_9', 'test_route', NOW);
    const second = await completeRoute(gateway, 'test_user_9', 'test_route', NOW);

    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already_completed');

    const raw = await gateway.getRawTab('24_PLAYER_PROGRESS', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_route_key');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'test_user_9|test_route');
    expect(matches).toHaveLength(1);
  });

  it('never touches first_journey_completed or map_unlocked (reserved for the real Map-unlock milestone)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await checkpointProgress(gateway, {
      userId: 'test_user_10',
      routeId: 'test_route',
      beatId: 'beat_final',
      checkpoint: true,
      now: NOW,
    });
    await completeRoute(gateway, 'test_user_10', 'test_route', NOW);

    const raw = await gateway.getRawTab('24_PLAYER_PROGRESS', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_route_key');
    const fjcIdx = header.indexOf('first_journey_completed');
    const muIdx = header.indexOf('map_unlocked');
    const rowValues = raw.find((r) => r[keyIdx] === 'test_user_10|test_route')!;
    expect(rowValues[fjcIdx]).toBe('');
    expect(rowValues[muIdx]).toBe('');
  });

  it('never mutates a pre-existing real-shaped fixture row for a different user (isolation)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.findByPrimaryKey('24_PLAYER_PROGRESS', 'veoulla|first_journey', {
      bypass: true,
    });

    await checkpointProgress(gateway, {
      userId: 'test_user_11',
      routeId: 'first_journey',
      beatId: 'beat_01',
      checkpoint: true,
      now: NOW,
    });

    const after = await gateway.findByPrimaryKey('24_PLAYER_PROGRESS', 'veoulla|first_journey', {
      bypass: true,
    });
    expect(after!.row.raw).toEqual(before!.row.raw);
  });
});
