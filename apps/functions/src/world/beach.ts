import { AppError } from '../errors/app-error.js';
import { getPlayerKeys } from '../services/player-keys.service.js';
import type { WorldCtx } from './common.js';
import { claimRuleReward, type RewardOutcome } from './rewards.js';
import { mutateWorldDoc } from './state.js';

/**
 * The Beach signature interaction (the shell). The browser only says "I
 * tapped the shell"; the server decides everything else: the player must have
 * finished the Gate/naming (`first_opening` = `naming_complete`), the reward is
 * whatever the Sheet's beat → key rule says (`14_STORY_BEATS` interaction
 * `beach_signature` → `22_KEY_RULES`), and it pays once per player.
 *
 * Players who received the shell through the retired client-chosen award
 * endpoint already own a Beach key; they are recorded as claimed and are never
 * paid a second time.
 */
export async function claimBeachSignature(ctx: WorldCtx): Promise<RewardOutcome> {
  const [progress, beats, keyTable] = await Promise.all([
    ctx.gateway.readTab('24_PLAYER_PROGRESS', { bypass: true }),
    ctx.gateway.readTab('14_STORY_BEATS'),
    ctx.gateway.readTab('21_KEYS'),
  ]);
  const opening = progress.rows.find(
    (r) => r.raw.user_id === ctx.userId && r.raw.story_route_id === 'first_opening',
  );
  if (opening?.raw.current_beat_id !== 'naming_complete') {
    throw new AppError('WORLD_LOCKED', 'The Beach is not open yet.');
  }
  const beat = beats.rows.find(
    (b) =>
      b.values.enabled === true &&
      b.raw.route_id === 'first_journey' &&
      b.raw.required_interaction_id === 'beach_signature',
  );
  const ruleId = beat?.raw.reward_rule_id ?? '';
  if (!ruleId) throw new AppError('not_found', 'No Beach reward is configured.');

  const rules = await ctx.gateway.readTab('22_KEY_RULES');
  const keyTypeId = rules.rows.find((r) => r.primaryKeyValue === ruleId)?.raw.key_type_id ?? '';
  const beachKeys = new Set(
    keyTable.rows.filter((k) => k.raw.location_id === 'beach').map((k) => k.primaryKeyValue),
  );
  const owned = (await getPlayerKeys(ctx.gateway, ctx.userId)).some(
    (k) => beachKeys.has(k.keyTypeId) && k.quantityFound > 0,
  );
  if (owned) {
    await mutateWorldDoc(ctx, 'rewards', (doc) => {
      doc.claimed[ruleId] ??= 'once';
    });
    return { ruleId, keyTypeId, quantity: 0, applied: false, reason: 'already_claimed' };
  }
  return claimRuleReward(ctx, ruleId);
}
