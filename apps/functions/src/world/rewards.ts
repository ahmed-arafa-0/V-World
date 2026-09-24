import { awardKey } from '../services/player-keys.service.js';
import { claimAchievement } from '../services/player-achievements.service.js';
import { getDayClock, isWithinWindow, parseJsonObject, usable, type WorldCtx } from './common.js';
import { mutateWorldDoc } from './state.js';

export type RewardReason =
  'awarded' | 'already_claimed' | 'not_available' | 'cap_deferred' | 'rule_missing';

export interface RewardOutcome {
  ruleId: string;
  keyTypeId: string;
  quantity: number;
  applied: boolean;
  reason: RewardReason;
}

/**
 * The only path by which the world grants a key. It reads the reward from
 * `22_KEY_RULES` (never from the client), honours the rule's availability
 * window and `once`/`daily` period, and records the claim in the player's
 * rewards document so a replay — including a forced replay of the first
 * journey — can never award it twice. The key award itself uses the
 * existing idempotent, daily-capped `awardKey` with a deterministic
 * transaction id.
 */
export async function claimRuleReward(ctx: WorldCtx, ruleId: string): Promise<RewardOutcome> {
  const missing: RewardOutcome = {
    ruleId,
    keyTypeId: '',
    quantity: 0,
    applied: false,
    reason: 'rule_missing',
  };
  if (!usable(ruleId)) return missing;
  const [rules, keys] = await Promise.all([
    ctx.gateway.readTab('22_KEY_RULES'),
    ctx.gateway.readTab('21_KEYS'),
  ]);
  const rule = rules.rows.find((r) => r.primaryKeyValue === ruleId && r.values.enabled === true);
  if (!rule) return missing;
  const keyTypeId = rule.raw.key_type_id ?? '';
  const keyRow = keys.rows.find(
    (k) => k.primaryKeyValue === keyTypeId && k.values.enabled === true,
  );
  const quantity =
    Number(rule.raw.reward_quantity) > 0 ? Math.floor(Number(rule.raw.reward_quantity)) : 1;
  if (!keyRow) return { ruleId, keyTypeId, quantity, applied: false, reason: 'not_available' };

  const clock = await getDayClock(ctx.gateway, ctx.now);
  if (!isWithinWindow(rule.raw.available_from, rule.raw.available_to, clock)) {
    return { ruleId, keyTypeId, quantity, applied: false, reason: 'not_available' };
  }

  const period = (rule.raw.period_type ?? 'once').trim() || 'once';
  const periodKey = period === 'daily' ? clock.today : 'once';

  const { result } = await mutateWorldDoc(ctx, 'rewards', async (doc): Promise<RewardOutcome> => {
    if (doc.claimed[ruleId] === periodKey) {
      return { ruleId, keyTypeId, quantity, applied: false, reason: 'already_claimed' };
    }
    const award = await awardKey(ctx.gateway, ctx.mutex, {
      userId: ctx.userId,
      keyTypeId,
      quantity,
      transactionId: `rule:${ruleId}:${periodKey}`,
      now: ctx.now,
    });
    if (award.reason === 'daily_cap_reached') {
      // Same key shape already collected today: try again on a later day, never trap the journey.
      return { ruleId, keyTypeId, quantity, applied: false, reason: 'cap_deferred' };
    }
    doc.claimed[ruleId] = periodKey;
    return {
      ruleId,
      keyTypeId,
      quantity,
      applied: award.applied,
      reason: award.applied ? 'awarded' : 'already_claimed',
    };
  });
  return result;
}

export interface AchievementOutcome {
  achievementId: string;
  applied: boolean;
  keyReward: RewardOutcome | null;
}

/**
 * Unlocks an achievement once (`26_PLAYER_ACHIEV.claimed` is the one-time
 * flag) and grants its optional key reward through the same idempotent path.
 * A disabled or unknown achievement id is ignored, never invented.
 */
export async function unlockAchievement(
  ctx: WorldCtx,
  achievementId: string,
): Promise<AchievementOutcome> {
  const none: AchievementOutcome = { achievementId, applied: false, keyReward: null };
  if (!usable(achievementId)) return none;
  const table = await ctx.gateway.readTab('23_ACHIEVEMENTS');
  const row = table.rows.find(
    (r) => r.primaryKeyValue === achievementId && r.values.enabled === true,
  );
  if (!row) return none;
  const claim = await ctx.mutex.run(`26:${ctx.userId}|${achievementId}`, () =>
    claimAchievement(ctx.gateway, ctx.userId, achievementId, ctx.now),
  );
  if (!claim.applied) return none;
  const rewardKey = row.raw.reward_key_type_id ?? '';
  const quantity = Number(row.raw.reward_quantity) || 0;
  let keyReward: RewardOutcome | null = null;
  if (usable(rewardKey) && quantity > 0) {
    const award = await awardKey(ctx.gateway, ctx.mutex, {
      userId: ctx.userId,
      keyTypeId: rewardKey,
      quantity,
      transactionId: `ach:${achievementId}`,
      now: ctx.now,
    });
    keyReward = {
      ruleId: `ach:${achievementId}`,
      keyTypeId: rewardKey,
      quantity,
      applied: award.applied,
      reason: award.applied
        ? 'awarded'
        : award.reason === 'daily_cap_reached'
          ? 'cap_deferred'
          : 'already_claimed',
    };
  }
  return { achievementId, applied: true, keyReward };
}

/** Reads a numeric threshold out of a rule/achievement JSON cell, if present. */
export function jsonNumber(raw: string | undefined, field: string): number | null {
  const value = parseJsonObject(raw)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Reads a string field out of a rule/achievement JSON cell, if present. */
export function jsonString(raw: string | undefined, field: string): string | null {
  const value = parseJsonObject(raw)[field];
  return typeof value === 'string' ? value : null;
}
