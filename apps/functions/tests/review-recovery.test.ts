import { describe, expect, it, vi } from 'vitest';
import { recoverArcadeIntroReward, recordAttempt } from '../src/world/arcade.js';
import { getPlayerKeys } from '../src/services/player-keys.service.js';
import { getJourneyState } from '../src/world/journey.js';
import { mutateWorldDoc } from '../src/world/state.js';
import { buildWorldWorkbook, worldGateway, worldCtx } from './helpers/world-fixture.js';
import { addArcadeContent, unlockThrough } from './helpers/world-fixture-extra.js';

async function missedReward(score = 80, result = 'win') {
  const gateway = worldGateway(buildWorldWorkbook(addArcadeContent));
  const ctx = worldCtx(gateway);
  await unlockThrough(ctx, 'beat_10_arcade');
  await mutateWorldDoc(ctx, 'journey', (d) => {
    d.beats.push('beat_10_arcade');
  });
  await mutateWorldDoc(ctx, 'arcade', (d) => {
    d.introWon = true;
  });
  await gateway.appendRow('33_PLAYER_SCORES', {
    attempt_id: `${ctx.userId}|saved`,
    user_id: ctx.userId,
    game_id: 'game_memory',
    score: String(score),
    result,
    played_at: ctx.now.toISOString(),
  });
  return { gateway, ctx };
}
describe('missed Arcade reward recovery', () => {
  it('recovers only the saved qualifying win, without moving its completed journey step or duplicating keys', async () => {
    const { gateway, ctx } = await missedReward();
    const before = await getJourneyState(ctx);
    expect(await recoverArcadeIntroReward(ctx)).toMatchObject({
      applied: true,
      keyTypeId: 'key_token',
    });
    expect(await recoverArcadeIntroReward(ctx)).toMatchObject({
      applied: false,
      reason: 'already_claimed',
    });
    expect(
      (await getPlayerKeys(gateway, ctx.userId)).find((k) => k.keyTypeId === 'key_token')
        ?.quantityFound,
    ).toBe(1);
    expect((await getJourneyState(ctx)).currentBeat).toEqual(before.currentBeat);
    expect(
      (await gateway.readTab('26_PLAYER_ACHIEV')).rows.filter((r) => r.raw.user_id === ctx.userId),
    ).toHaveLength(0);
  });
  it('retries the actual partial-write failure after the beat was saved but its key append failed', async () => {
    const gateway = worldGateway(buildWorldWorkbook(addArcadeContent));
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_10_arcade');
    const original = gateway.appendRow.bind(gateway);
    let fail = true;
    const spy = vi.spyOn(gateway, 'appendRow').mockImplementation(async (tab, row) => {
      if (tab === '25_PLAYER_KEYS' && row.key_type_id === 'key_token' && fail) {
        fail = false;
        throw Error('simulated lost key write');
      }
      return original(tab, row);
    });
    const attempt = {
      gameId: 'game_memory',
      clientAttemptId: 'partial',
      score: 80,
      result: 'win' as const,
    };
    await expect(recordAttempt(ctx, attempt)).rejects.toThrow('simulated lost key write');
    expect((await getJourneyState(ctx)).currentBeat?.beatId).toBe('beat_11_cottage');
    expect((await recordAttempt(ctx, attempt)).state.rewards).toContainEqual(
      expect.objectContaining({ applied: true, keyTypeId: 'key_token' }),
    );
    spy.mockRestore();
  });
  it('also recovers when the player retries the saved attempt', async () => {
    const { ctx } = await missedReward();
    const r = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'saved',
      score: 80,
      result: 'win',
    });
    expect(r.duplicate).toBe(true);
    expect(r.state.rewards).toContainEqual(
      expect.objectContaining({ keyTypeId: 'key_token', applied: true }),
    );
  });
  it.each([
    [0, 'win'],
    [80, 'lose'],
  ])('rejects ineligible saved score %s / %s', async (score, result) => {
    const { ctx } = await missedReward(score as number, result as string);
    expect(await recoverArcadeIntroReward(ctx)).toBeNull();
  });
  it('a forged retry cannot turn a saved loss into a qualifying win', async () => {
    const { ctx } = await missedReward(0, 'lose');
    const r = await recordAttempt(ctx, {
      gameId: 'game_memory',
      clientAttemptId: 'saved',
      score: 999,
      result: 'win',
    });
    expect(r.state.rewards).toEqual([]);
  });
  it('respects disabled rules, availability and daily caps', async () => {
    const { gateway, ctx } = await missedReward();
    await gateway.updateByPrimaryKey('22_KEY_RULES', 'rule_first_token', {
      available_from: '2099-01-01',
    });
    expect(await recoverArcadeIntroReward(ctx)).toMatchObject({
      applied: false,
      reason: 'not_available',
    });
    await gateway.updateByPrimaryKey('22_KEY_RULES', 'rule_first_token', {
      available_from: '<FIRST_VISIT>',
    });
    await gateway.appendRow('25_PLAYER_KEYS', {
      user_key_type: `${ctx.userId}|key_token`,
      user_id: ctx.userId,
      key_type_id: 'key_token',
      quantity_found: '1',
      quantity_available: '0',
      quantity_spent: '1',
      last_award_date: '2026-09-26',
    });
    expect(await recoverArcadeIntroReward(ctx)).toMatchObject({
      applied: false,
      reason: 'cap_deferred',
    });
    await gateway.updateByPrimaryKey('22_KEY_RULES', 'rule_first_token', { enabled: 'FALSE' });
    await expect(recoverArcadeIntroReward(ctx)).rejects.toMatchObject({
      code: 'WORLD_INVALID_STATE',
    });
  });
  it('never uses a historical win to farm a recurring reward period', async () => {
    const { gateway, ctx } = await missedReward();
    await gateway.updateByPrimaryKey('22_KEY_RULES', 'rule_first_token', { period_type: 'daily' });
    expect(await recoverArcadeIntroReward(ctx)).toBeNull();
  });
});
