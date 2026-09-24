import type {
  ArcadeAttemptResponse,
  ArcadeGameView,
  ArcadeStateResponse,
  WorldAchievementView,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import { getPlayerKeys, spendKey } from '../services/player-keys.service.js';
import { parseJsonObject, usable, type WorldCtx } from './common.js';
import { assertLocationAccess, syncJourney } from './journey.js';
import { claimRuleReward, jsonNumber, unlockAchievement } from './rewards.js';
import { mutateWorldDoc, readWorldDoc } from './state.js';

const SUPPORTED_SLOTS = 5;
const MAX_DIFFICULTY = 5;
const MAX_SCORE = 1_000_000;

interface Attempt {
  attemptId: string;
  gameId: string;
  playedAt: string;
  score: number;
  difficulty: number;
  result: string;
}

async function loadAttempts(ctx: WorldCtx, gameId?: string): Promise<Attempt[]> {
  const table = await ctx.gateway.readTab('33_PLAYER_SCORES');
  return table.rows
    .filter((r) => r.raw.user_id === ctx.userId && (!gameId || r.raw.game_id === gameId))
    .map((r) => ({
      attemptId: r.primaryKeyValue ?? '',
      gameId: r.raw.game_id ?? '',
      playedAt: r.raw.played_at ?? '',
      score: Number(r.raw.score) || 0,
      difficulty: Number(r.raw.difficulty) || 1,
      result: r.raw.result ?? '',
    }))
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

/**
 * Adaptive difficulty, computed from the attempt history (never chosen by the
 * player): two wins in a row raise the level, two losses in a row lower it,
 * within 1..5. Attempts are unlimited; only the level and rewards change.
 */
export function adaptiveDifficulty(history: { result: string }[]): number {
  let level = 1;
  let wins = 0;
  let losses = 0;
  for (const attempt of history) {
    if (attempt.result === 'win') {
      wins += 1;
      losses = 0;
      if (wins >= 2) {
        level = Math.min(MAX_DIFFICULTY, level + 1);
        wins = 0;
      }
    } else {
      losses += 1;
      wins = 0;
      if (losses >= 2) {
        level = Math.max(1, level - 1);
        losses = 0;
      }
    }
  }
  return level;
}

async function buildState(ctx: WorldCtx): Promise<ArcadeStateResponse> {
  const [games, attempts, keys, doc] = await Promise.all([
    ctx.gateway.readTab('32_ARCADE_GAMES'),
    loadAttempts(ctx),
    getPlayerKeys(ctx.gateway, ctx.userId),
    readWorldDoc(ctx.gateway, ctx.userId, 'arcade'),
  ]);
  const views: ArcadeGameView[] = games.rows
    .map((g) => {
      const gameId = g.primaryKeyValue ?? '';
      const mine = attempts.filter((a) => a.gameId === gameId);
      const cost = Number(g.raw.key_cost_quantity) || 0;
      const costKey = usable(g.raw.key_cost_type_id) ? g.raw.key_cost_type_id! : '';
      const owned = keys.find((k) => k.keyTypeId === costKey)?.quantityAvailable ?? 0;
      return {
        gameId,
        cabinetSlot: Number(g.raw.cabinet_slot) || 0,
        family: g.raw.game_family ?? '',
        displayNameTextId: g.raw.display_name_text_id ?? '',
        installed: g.values.enabled === true,
        unlocked: g.values.enabled === true && (cost === 0 || doc.unlocked.includes(gameId)),
        keyCost: { keyTypeId: costKey, quantity: cost },
        canAfford: cost === 0 || owned >= cost,
        walkmanVolumePercent: Number(g.raw.walkman_volume_percent) || 25,
        sfxEnabled: g.values.sfx_enabled !== false,
        // Approved rule: games have SFX only and no game music, whatever the row says.
        musicEnabled: false,
        difficulty: adaptiveDifficulty(mine),
        scoreMode: g.raw.score_mode ?? 'score',
        personalBest: mine.length ? Math.max(...mine.map((a) => a.score)) : null,
        attempts: mine.length,
        recent: mine
          .slice(-5)
          .reverse()
          .map((a) => ({ playedAt: a.playedAt, score: a.score, result: a.result })),
      };
    })
    .filter((g) => g.cabinetSlot >= 1 && g.cabinetSlot <= SUPPORTED_SLOTS)
    .sort((a, b) => a.cabinetSlot - b.cabinetSlot);
  const tokenKey = views.find((v) => v.keyCost.keyTypeId)?.keyCost.keyTypeId ?? '';
  return {
    ok: true,
    supportedSlots: SUPPORTED_SLOTS,
    games: views,
    tokens: keys.find((k) => k.keyTypeId === tokenKey)?.quantityAvailable ?? 0,
    introWon: doc.introWon,
  };
}

export async function getArcadeState(ctx: WorldCtx): Promise<ArcadeStateResponse> {
  return buildState(ctx);
}

export async function enterArcade(ctx: WorldCtx): Promise<ArcadeStateResponse> {
  await assertLocationAccess(ctx, 'arcade');
  await mutateWorldDoc(ctx, 'arcade', (doc) => {
    doc.visited = true;
  });
  return buildState(ctx);
}

/** Spends the Sheet-configured key cost to unlock a cabinet (idempotent; already-unlocked is a no-op). */
export async function unlockCabinet(ctx: WorldCtx, gameId: string): Promise<ArcadeStateResponse> {
  await assertLocationAccess(ctx, 'arcade');
  const games = await ctx.gateway.readTab('32_ARCADE_GAMES');
  const game = games.rows.find((g) => g.primaryKeyValue === gameId && g.values.enabled === true);
  if (!game) throw new AppError('not_found', 'That machine is not installed.');
  const cost = Number(game.raw.key_cost_quantity) || 0;
  await ctx.mutex.run(`arcade-unlock:${ctx.userId}:${gameId}`, async () => {
    const doc = await readWorldDoc(ctx.gateway, ctx.userId, 'arcade', { bypass: true });
    if (cost === 0 || doc.unlocked.includes(gameId)) return;
    const keyTypeId = game.raw.key_cost_type_id ?? '';
    if (!usable(keyTypeId))
      throw new AppError('WORLD_INVALID_STATE', 'This machine has no unlock cost configured.');
    const spend = await spendKey(ctx.gateway, ctx.mutex, {
      userId: ctx.userId,
      keyTypeId,
      quantity: cost,
      transactionId: `arcade_unlock:${gameId}`,
      now: ctx.now,
    });
    if (!spend.applied && spend.reason === 'insufficient_keys') {
      throw new AppError('WORLD_INVALID_STATE', 'Not enough keys to unlock this machine yet.');
    }
    await mutateWorldDoc(ctx, 'arcade', (d) => {
      if (!d.unlocked.includes(gameId)) d.unlocked.push(gameId);
    });
  });
  return buildState(ctx);
}

/** Reconcile a missed introductory reward from persisted wins, never from a client claim.
 * This remains explicit (a retry or the Museum's check action), not a side effect of a GET.
 */
export async function recoverArcadeIntroReward(ctx: WorldCtx): Promise<WorldRewardView | null> {
  await assertLocationAccess(ctx, 'arcade');
  const [state, attempts, rules, beats] = await Promise.all([
    buildState(ctx),
    loadAttempts(ctx),
    ctx.gateway.readTab('22_KEY_RULES'),
    ctx.gateway.readTab('14_STORY_BEATS'),
  ]);
  const game = state.games.find((g) => g.installed);
  const introBeat = beats.rows.find(
    (r) =>
      r.values.enabled === true &&
      r.raw.route_id === 'first_journey' &&
      r.raw.required_interaction_id === 'arcade_intro_game',
  );
  const rule = rules.rows.find(
    (r) => r.values.enabled === true && r.primaryKeyValue === introBeat?.raw.reward_rule_id,
  );
  if (!rule)
    throw new AppError(
      'WORLD_INVALID_STATE',
      'The introductory Arcade reward is not configured. Ask Ahmed to check its enabled reward rule.',
    );
  // Historical wins may reconcile a once-only story reward; they must never farm a later daily period.
  if ((rule.raw.period_type?.trim() || 'once') !== 'once') return null;
  const minimum = jsonNumber(rule.raw.condition_json, 'min_score') ?? 1;
  if (
    !game ||
    !state.introWon ||
    !attempts.some((a) => a.gameId === game.gameId && a.result === 'win' && a.score >= minimum)
  )
    return null;
  // Availability, daily limits and the one-time ledger still run through the ordinary rules engine.
  return claimRuleReward(ctx, rule.primaryKeyValue ?? '');
}

export interface AttemptInput {
  gameId: string;
  clientAttemptId: string;
  score: number;
  result: 'win' | 'lose';
}

/** Achievement triggers of type `arcade` (`trigger_rule_json`: game_id?, min_score?, attempts?, wins?). */
async function evaluateArcadeAchievements(
  ctx: WorldCtx,
  gameId: string,
  attempts: Attempt[],
): Promise<WorldAchievementView[]> {
  const table = await ctx.gateway.readTab('23_ACHIEVEMENTS');
  const out: WorldAchievementView[] = [];
  for (const row of table.rows) {
    if (row.values.enabled !== true || row.raw.trigger_type !== 'arcade') continue;
    const rule = parseJsonObject(row.raw.trigger_rule_json);
    const scoped = typeof rule.game_id === 'string' ? rule.game_id : null;
    if (scoped && scoped !== gameId) continue;
    const pool = scoped ? attempts.filter((a) => a.gameId === scoped) : attempts;
    const minScore = jsonNumber(row.raw.trigger_rule_json, 'min_score');
    const attemptsNeeded = jsonNumber(row.raw.trigger_rule_json, 'attempts');
    const winsNeeded = jsonNumber(row.raw.trigger_rule_json, 'wins');
    const checks = [
      minScore === null || pool.some((a) => a.score >= minScore),
      attemptsNeeded === null || pool.length >= attemptsNeeded,
      winsNeeded === null || pool.filter((a) => a.result === 'win').length >= winsNeeded,
    ];
    if (minScore === null && attemptsNeeded === null && winsNeeded === null) continue;
    if (!checks.every(Boolean)) continue;
    const outcome = await unlockAchievement(ctx, row.primaryKeyValue ?? '');
    if (outcome.applied) out.push(outcome);
  }
  return out;
}

/**
 * Records one finished attempt. The difficulty stored is the one the SERVER
 * assigned (adaptive), the personal best is computed here, and any key reward
 * goes through the rules engine (`once` per period no matter how many attempts).
 * Retrying the same `clientAttemptId` is idempotent.
 */
export async function recordAttempt(
  ctx: WorldCtx,
  input: AttemptInput,
): Promise<ArcadeAttemptResponse> {
  await assertLocationAccess(ctx, 'arcade');
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > MAX_SCORE) {
    throw new AppError('invalid_request', 'score must be a whole number within range.');
  }
  if (input.result !== 'win' && input.result !== 'lose') {
    throw new AppError('invalid_request', 'result must be "win" or "lose".');
  }
  const state = await buildState(ctx);
  const game = state.games.find((g) => g.gameId === input.gameId);
  if (!game || !game.installed) throw new AppError('not_found', 'That machine is not installed.');
  if (!game.unlocked) throw new AppError('WORLD_LOCKED', 'That machine is still locked.');

  const attemptId = `${ctx.userId}|${input.clientAttemptId}`;
  const history = await loadAttempts(ctx, input.gameId);
  const previousBest = history.length ? Math.max(...history.map((a) => a.score)) : null;
  const isBest = previousBest === null || input.score > previousBest;

  const appended = await ctx.gateway.appendIfAbsent('33_PLAYER_SCORES', attemptId, () => ({
    attempt_id: attemptId,
    user_id: ctx.userId,
    game_id: input.gameId,
    played_at: ctx.now.toISOString(),
    score: String(input.score),
    difficulty: String(game.difficulty),
    result: input.result,
    personal_best: isBest ? 'TRUE' : 'FALSE',
    achievement_ids: '',
    key_rewarded: 'FALSE',
    updated_at: ctx.now.toISOString(),
  }));

  let rewards: WorldRewardView[] = [];
  let achievements: WorldAchievementView[] = [];
  if (appended.created && input.result === 'win') {
    const rules = await ctx.gateway.readTab('22_KEY_RULES');
    const introRule = rules.rows.find(
      (r) => r.values.enabled === true && r.raw.source_id === 'arcade_intro_game',
    );
    const introMin = jsonNumber(introRule?.raw.condition_json, 'min_score') ?? 1;
    // The introductory machine is the first cabinet; winning it once completes the story step.
    if (
      game.cabinetSlot === state.games.find((g) => g.installed)?.cabinetSlot &&
      input.score >= introMin
    ) {
      await mutateWorldDoc(ctx, 'arcade', (doc) => {
        doc.introWon = true;
      });
    }
    // Sheet-added rules keyed `arcade:<game_id>` pay once per their own period.
    for (const rule of rules.rows) {
      if (rule.values.enabled !== true || rule.raw.source_type !== 'arcade_score') continue;
      if (rule.raw.source_id !== `arcade:${input.gameId}`) continue;
      const min = jsonNumber(rule.raw.condition_json, 'min_score') ?? 1;
      if (input.score < min) continue;
      const reward = await claimRuleReward(ctx, rule.primaryKeyValue ?? '');
      if (reward.applied) rewards.push(reward);
    }
  }
  if (appended.created) {
    const all = await loadAttempts(ctx);
    achievements = await evaluateArcadeAchievements(ctx, input.gameId, all);
  }
  // A prior request may have saved the win/beat before its key write failed. Completing a
  // beat again is impossible, so retry its independently idempotent reward from saved evidence.
  const journey = await syncJourney(ctx);
  const recovered = await recoverArcadeIntroReward(ctx);
  if (recovered?.applied) rewards.push(recovered);
  rewards = [...rewards, ...(journey.advanced ?? []).flatMap((a) => (a.reward ? [a.reward] : []))];

  const fresh = await buildState(ctx);
  const nextDifficulty = fresh.games.find((g) => g.gameId === input.gameId)?.difficulty ?? 1;
  return {
    ok: true,
    attemptId,
    duplicate: !appended.created,
    personalBest: appended.created && isBest,
    nextDifficulty,
    state: { ...fresh, rewards, achievements },
  };
}
