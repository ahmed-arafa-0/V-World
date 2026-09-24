import { describe, expect, it } from 'vitest';
import { row } from '@veoullas-world/test-fixtures';
import { enterArcade, recordAttempt, unlockCabinet } from '../src/world/arcade.js';
import { getPlayerKeys } from '../src/services/player-keys.service.js';
import type { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { buildWorldWorkbook, worldCtx, worldGateway } from './helpers/world-fixture.js';
import { addArcadeContent, unlockThrough } from './helpers/world-fixture-extra.js';

/** Seeds a starting key_token balance directly (no prior award, so no `last_award_date` to fight the daily cap). */
async function seedTokens(gateway: SheetGateway, userId: string): Promise<void> {
  await gateway.appendRow('25_PLAYER_KEYS', {
    user_key_type: `${userId}|key_token`,
    user_id: userId,
    key_type_id: 'key_token',
    quantity_found: '10',
    quantity_spent: '0',
    quantity_available: '10',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

/**
 * Covers the state this pass switches on: `game_maze`/`game_trivia` enabled in
 * `32_ARCADE_GAMES` plus their own `22_KEY_RULES` reward rows (mirroring the
 * existing Memory/Catch/Puzzle pattern exactly — `source_type: 'arcade_score'`,
 * `source_id: 'arcade:<game_id>'`). `arcade.ts` itself needed no changes for
 * this: it is already family-agnostic (confirmed by this test using it
 * unmodified for a `var_maze`/`trivia`-family game).
 */
function build() {
  return buildWorldWorkbook((wb) => {
    addArcadeContent(wb);
    wb['32_ARCADE_GAMES'] = wb['32_ARCADE_GAMES']!.map((r) => {
      if (r[0] === 'game_maze' || r[0] === 'game_trivia') {
        const copy = [...r];
        copy[copy.length - 2] = 'TRUE'; // enabled column
        return copy;
      }
      return r;
    });
    wb['22_KEY_RULES'] = [
      ...wb['22_KEY_RULES']!,
      row('22_KEY_RULES', {
        rule_id: 'rule_arcade_maze',
        key_type_id: 'key_token',
        source_type: 'arcade_score',
        source_id: 'arcade:game_maze',
        max_awards_per_period: '1',
        period_type: 'once',
        reward_quantity: '1',
        condition_json: '{"min_score":1}',
        enabled: 'TRUE',
      }),
      row('22_KEY_RULES', {
        rule_id: 'rule_arcade_trivia',
        key_type_id: 'key_token',
        source_type: 'arcade_score',
        source_id: 'arcade:game_trivia',
        max_awards_per_period: '1',
        period_type: 'once',
        reward_quantity: '1',
        condition_json: '{"min_score":1}',
        enabled: 'TRUE',
      }),
    ];
  });
}

// Stops short of completing `beat_10_arcade` itself (its own reward is the game_memory intro
// token), so the daily key_token cap is still free for this test's own maze/trivia reward.
async function at() {
  const gateway = worldGateway(build());
  const ctx = worldCtx(gateway);
  await unlockThrough(ctx, 'beat_10_arcade');
  return { gateway, ctx };
}

describe('Arcade — Maze and Trivia enabled', () => {
  it('shows both cabinets installed (locked, costing tokens) on first visit', async () => {
    const { ctx } = await at();
    const state = await enterArcade(ctx);
    const maze = state.games.find((g) => g.gameId === 'game_maze')!;
    const trivia = state.games.find((g) => g.gameId === 'game_trivia')!;
    expect(maze).toMatchObject({ installed: true, unlocked: false, family: 'var_maze' });
    expect(trivia).toMatchObject({ installed: true, unlocked: false, family: 'trivia' });
  });

  it('unlocks and plays the Maze cabinet, awarding the token key exactly once', async () => {
    const { ctx, gateway } = await at();
    await seedTokens(gateway, ctx.userId);
    await unlockCabinet(ctx, 'game_maze');
    const before = (await getPlayerKeys(gateway, ctx.userId)).find(
      (k) => k.keyTypeId === 'key_token',
    )?.quantityAvailable;

    const result = await recordAttempt(ctx, {
      gameId: 'game_maze',
      clientAttemptId: 'maze-1',
      score: 42,
      result: 'win',
    });
    expect(result.duplicate).toBe(false);
    expect(result.state.rewards?.some((r) => r.keyTypeId === 'key_token' && r.applied)).toBe(true);

    // Retrying the same attempt id never pays twice.
    const retried = await recordAttempt(ctx, {
      gameId: 'game_maze',
      clientAttemptId: 'maze-1',
      score: 42,
      result: 'win',
    });
    expect(retried.duplicate).toBe(true);
    const after = (await getPlayerKeys(gateway, ctx.userId)).find(
      (k) => k.keyTypeId === 'key_token',
    )?.quantityAvailable;
    expect(after).toBe((before ?? 0) + 1); // +1 reward only; the retry paid nothing extra
  });

  it('unlocks and plays the Trivia cabinet, awarding the token key exactly once', async () => {
    const { ctx, gateway } = await at();
    await seedTokens(gateway, ctx.userId);
    await unlockCabinet(ctx, 'game_trivia');
    const result = await recordAttempt(ctx, {
      gameId: 'game_trivia',
      clientAttemptId: 'trivia-1',
      score: 60,
      result: 'win',
    });
    expect(result.state.rewards?.some((r) => r.keyTypeId === 'key_token' && r.applied)).toBe(true);
  });

  it('never awards a second token key for the same eligible period across a retry', async () => {
    const { ctx, gateway } = await at();
    await seedTokens(gateway, ctx.userId);
    await unlockCabinet(ctx, 'game_maze');
    await recordAttempt(ctx, {
      gameId: 'game_maze',
      clientAttemptId: 'a',
      score: 10,
      result: 'win',
    });
    const second = await recordAttempt(ctx, {
      gameId: 'game_maze',
      clientAttemptId: 'b',
      score: 10,
      result: 'win',
    });
    expect(second.state.rewards?.some((r) => r.keyTypeId === 'key_token' && r.applied)).toBe(false);
  });
});
