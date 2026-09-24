import type {
  ChurchAnswerResponse,
  ChurchQuizQuestionView,
  ChurchStateResponse,
  ChurchTextView,
  WorldAchievementView,
  WorldRewardView,
} from '@veoullas-world/contracts';
import type { NormalizedRow } from '@veoullas-world/sheet-schema';
import { AppError } from '../errors/app-error.js';
import { awardKey } from '../services/player-keys.service.js';
import {
  directionFor,
  getDayClock,
  groupBy,
  isScheduledDue,
  isScheduledToday,
  pickLocaleRow,
  readAppConfig,
  usable,
  type WorldCtx,
} from './common.js';
import { assertLocationAccess, syncJourney } from './journey.js';
import { resolveAssetRefs } from './media.js';
import { claimRuleReward, jsonNumber, unlockAchievement } from './rewards.js';
import { mutateWorldDoc, readWorldDoc, type ChurchDoc } from './state.js';

const DEFAULT_CANDLE_SLOTS = 6;
/**
 * How far a player may grow the tray above the original slot count via Add. Neither the Living Bible nor
 * the Master Build Plan sets a capacity for a player-arranged tray (only `church_candle_slots`, the
 * *starting* count, already existed) — this implementation's own choice, kept modest and workable at
 * both screen sizes by the candle corner's staggered-row layout.
 */
const CANDLE_ADD_HEADROOM = 4;
/** Bounds how many recent Add requests are remembered for idempotent replay (state stays small). */
const ADD_REQUEST_HISTORY_LIMIT = 20;
/** A tray candle id: either an original slot (`candle_3`) or a player-added one (`candle_a7`). */
const CANDLE_ID_PATTERN = /^candle_a?\d+$/;

/** The tray's starting slot count — unchanged meaning of the existing `church_candle_slots` config. */
function candleDefaultCount(config: Map<string, string>): number {
  return Number(config.get('church_candle_slots')) || DEFAULT_CANDLE_SLOTS;
}

/** The tray's maximum size once a player is arranging it (starting count + the Add headroom above). */
function candleCapacity(config: Map<string, string>): number {
  return candleDefaultCount(config) + CANDLE_ADD_HEADROOM;
}

function defaultCandleIds(defaultCount: number): string[] {
  return Array.from({ length: defaultCount }, (_, i) => `candle_${i + 1}`);
}

/**
 * The candles actually in the tray right now. Until the player customizes the arrangement (Add/Remove),
 * this is exactly the original fixed set — the already-verified, unchanged tap-to-light/extinguish
 * behavior for every player who never touches Add/Remove.
 */
function presentCandles(doc: ChurchDoc, defaultCount: number): string[] {
  return doc.candleCustomized ? doc.candlePresent : defaultCandleIds(defaultCount);
}

/**
 * The first customization (Add or Remove) seeds the stored arrangement from the current default set,
 * so existing candles and their stable ids are preserved exactly, never reset.
 */
function materializeArrangement(doc: ChurchDoc, defaultCount: number): void {
  if (!doc.candleCustomized) {
    doc.candlePresent = defaultCandleIds(defaultCount);
    doc.candleCustomized = true;
  }
}

/** Religious content shows only when reviewed and complete; anything else is treated as absent. */
function isApproved(row: NormalizedRow): boolean {
  return (
    row.values.enabled === true &&
    row.raw.review_status === 'approved' &&
    usable(row.raw.text ?? row.raw.question)
  );
}

function textView(
  rows: NormalizedRow[],
  locale: string,
  imageRefs: Map<string, string>,
): ChurchTextView | null {
  const candidates = rows
    .filter(isApproved)
    .filter((r) => usable(r.raw.bible_reference))
    .map((r) => ({ locale: r.raw.locale ?? '', r }));
  const picked = pickLocaleRow(candidates, locale);
  if (!picked) return null;
  const r = picked.row.r;
  const ids = (r.raw.image_asset_ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => usable(id));
  return {
    contentId: r.raw.content_id ?? '',
    title: usable(r.raw.title) ? r.raw.title! : '',
    text: r.raw.text ?? '',
    reference: r.raw.bible_reference ?? '',
    locale: picked.usedLocale,
    direction: directionFor(picked.usedLocale),
    imageRefs: ids.map((id) => imageRefs.get(id)).filter((ref): ref is string => Boolean(ref)),
    activeDate: r.raw.active_date ?? '',
  };
}

const LETTERS = ['a', 'b', 'c', 'd'] as const;

function questionRowsFor(
  rows: NormalizedRow[],
  clock: { today: string; timeZone: string },
): Map<string, NormalizedRow[]> {
  const today = rows.filter(
    (r) => r.raw.question_row_id !== undefined && isScheduledToday(r.raw.active_date, clock),
  );
  return groupBy(today, (r) => r.raw.question_id ?? '');
}

function buildQuestion(
  questionId: string,
  rows: NormalizedRow[],
  locale: string,
  doc: ChurchDoc,
  today: string,
): ChurchQuizQuestionView | null {
  const approved = rows.filter(
    (r) =>
      r.values.enabled === true && r.raw.review_status === 'approved' && usable(r.raw.question),
  );
  const picked = pickLocaleRow(
    approved.map((r) => ({ locale: r.raw.locale ?? '', r })),
    locale,
  );
  if (!picked) return null;
  const r = picked.row.r;
  const type = r.raw.question_type === 'true_false' ? 'true_false' : 'multiple_choice';
  let options: { id: string; text: string }[];
  if (type === 'true_false') {
    // Labels for true/false are localized interface text supplied by the client.
    options = [
      { id: 'true', text: '' },
      { id: 'false', text: '' },
    ];
  } else {
    options = LETTERS.map((letter) => ({
      id: letter,
      text: r.raw[`option_${letter}`] ?? '',
    })).filter((o) => usable(o.text));
  }
  if (options.length < 2) return null;
  return {
    questionId,
    question: r.raw.question!,
    questionType: type,
    options,
    locale: picked.usedLocale,
    direction: directionFor(picked.usedLocale),
    answered: doc.quiz[today]?.answered.includes(questionId) ?? false,
  };
}

function normalizeAnswer(value: string | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 't') return 'true';
  if (v === 'f') return 'false';
  return v;
}

export async function getChurchState(
  ctx: WorldCtx,
  locale: string,
  fresh = false,
): Promise<ChurchStateResponse> {
  const [clock, content, quiz, config, doc] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    ctx.gateway.readTab('30_CHURCH_CONTENT'),
    ctx.gateway.readTab('31_CHURCH_QUIZ'),
    readAppConfig(ctx.gateway),
    readWorldDoc(
      ctx.gateway,
      ctx.userId,
      'church',
      fresh ? { bypass: true, strict: true } : undefined,
    ),
  ]);
  const imageIds = content.rows.flatMap((r) =>
    (r.raw.image_asset_ids ?? '').split(',').map((s) => s.trim()),
  );
  const [imageRefs] = await Promise.all([resolveAssetRefs(ctx.gateway, imageIds)]);
  const byContent = groupBy(content.rows, (r) => r.raw.content_id ?? '');

  const forType = (type: string, when: (raw: string | undefined) => boolean) =>
    [...byContent.entries()]
      .filter(([, rows]) =>
        rows.some((r) => r.raw.content_type === type && when(r.raw.active_date)),
      )
      .map(([, rows]) => rows.filter((r) => r.raw.content_type === type));

  const verse = forType('verse', (d) => isScheduledToday(d, clock))
    .map((rows) => textView(rows, locale, imageRefs))
    .find(Boolean);
  const story = forType('story', (d) => isScheduledToday(d, clock))
    .map((rows) => textView(rows, locale, imageRefs))
    .find(Boolean);
  const photo = forType('photo', (d) => isScheduledDue(d, clock))
    .map((rows) => textView(rows, locale, imageRefs))
    .find(Boolean);
  const gallery = doc.openedStories
    .map((contentId) =>
      textView(
        (byContent.get(contentId) ?? []).filter((r) => r.raw.content_type === 'story'),
        locale,
        imageRefs,
      ),
    )
    .filter((v): v is ChurchTextView => v !== null)
    .sort((a, b) => a.activeDate.localeCompare(b.activeDate));

  const questions = [...questionRowsFor(quiz.rows, clock).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rows]) => buildQuestion(id, rows, locale, doc, clock.today))
    .filter((q): q is ChurchQuizQuestionView => q !== null);
  const dayQuiz = doc.quiz[clock.today];
  const present = presentCandles(doc, candleDefaultCount(config));
  const litToday = (doc.candles[clock.today] ?? []).filter((id) => present.includes(id));

  return {
    ok: true,
    today: clock.today,
    verse: verse ?? null,
    story: story ?? null,
    gallery,
    photo: photo ?? null,
    hymns: [],
    gospelReadingAudioRef: null,
    quiz: {
      questions,
      completed: dayQuiz?.completed ?? false,
      perfect: dayQuiz?.perfect ?? false,
      wrongAttempts: dayQuiz?.wrong ?? 0,
    },
    candles: {
      slots: present,
      lit: [...new Set([...doc.preservedCandles, ...litToday])].filter((id) =>
        present.includes(id),
      ),
      preserved: doc.preservedCandles.filter((id) => present.includes(id)),
      litToday: litToday.length,
      capacity: candleCapacity(config),
      addRequests: doc.candleAddRequests,
    },
    firstInteractionDone: doc.candlesLitEver > 0,
  };
}

/** Player enters the Church interior. Gated by the journey's location access. */
export async function enterChurch(ctx: WorldCtx, locale: string): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  await mutateWorldDoc(ctx, 'church', (doc) => {
    doc.visited = true;
  });
  return getChurchState(ctx, locale);
}

function rewardsFrom(
  advanced: { reward: WorldRewardView | null }[] | undefined,
): WorldRewardView[] {
  return (advanced ?? []).map((a) => a.reward).filter((r): r is WorldRewardView => r !== null);
}

/**
 * Lights one candle. Ordinary candles reset each authoritative day; a candle
 * lit on a Sheet-flagged occasion day (`30_CHURCH_CONTENT` row of type
 * `candle_occasion` scheduled for today) is preserved permanently. Lighting
 * the same candle again is a no-op, so replay can never duplicate the key.
 */
export async function lightCandle(
  ctx: WorldCtx,
  candleId: string,
  locale: string,
): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  const [clock, content, config] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    ctx.gateway.readTab('30_CHURCH_CONTENT'),
    readAppConfig(ctx.gateway),
  ]);
  const defaultCount = candleDefaultCount(config);
  if (!CANDLE_ID_PATTERN.test(candleId)) {
    throw new AppError('invalid_request', 'Unknown candle.');
  }
  const occasionToday = content.rows.some(
    (r) =>
      r.values.enabled === true &&
      r.raw.content_type === 'candle_occasion' &&
      isScheduledToday(r.raw.active_date, clock),
  );
  await mutateWorldDoc(ctx, 'church', (doc) => {
    // Authoritative gate: a removed (or never-added) candle can never be lit, checked against the
    // freshest doc inside this transactional retry, not a value read before the request started.
    if (!presentCandles(doc, defaultCount).includes(candleId)) {
      throw new AppError('invalid_request', 'Unknown candle.');
    }
    const lit = doc.candles[clock.today] ?? [];
    // Ordinary candles reset daily: keep only today's list.
    doc.candles = { [clock.today]: lit };
    if (doc.preservedCandles.includes(candleId) || lit.includes(candleId)) return;
    lit.push(candleId);
    doc.candlesLitEver += 1;
    if (occasionToday) doc.preservedCandles.push(candleId);
  });
  const journey = await syncJourney(ctx);
  // The candle write, journey checkpoint and reward ledger are separate Sheet writes. If a prior
  // response was lost between them, retry the configured ONCE rule from the persisted completed beat.
  // The ordinary reward engine still enforces availability, caps and the stable transaction ledger.
  const [beats, rules, journeyDoc] = await Promise.all([
    ctx.gateway.readTab('14_STORY_BEATS'),
    ctx.gateway.readTab('22_KEY_RULES'),
    readWorldDoc(ctx.gateway, ctx.userId, 'journey'),
  ]);
  const beat = beats.rows.find(
    (r) =>
      r.values.enabled === true &&
      r.raw.route_id === 'first_journey' &&
      r.raw.required_interaction_id === 'church_first_interaction',
  );
  const rule = rules.rows.find(
    (r) => r.values.enabled === true && r.primaryKeyValue === beat?.raw.reward_rule_id,
  );
  const recovered =
    beat &&
    rule &&
    journeyDoc.beats.includes(beat.primaryKeyValue ?? '') &&
    (rule.raw.period_type?.trim() || 'once') === 'once'
      ? await claimRuleReward(ctx, rule.primaryKeyValue ?? '')
      : null;
  const state = await getChurchState(ctx, locale);
  return {
    ...state,
    rewards: [...rewardsFrom(journey.advanced), ...(recovered?.applied ? [recovered] : [])],
  };
}

/**
 * Puts one candle out again. It only changes what is shown: `candlesLitEver` (the reward fact) is never
 * touched, so lighting and extinguishing repeatedly can never pay a key twice. A candle preserved on an
 * occasion day stays lit. Extinguishing an already-dark candle is a no-op.
 */
export async function extinguishCandle(
  ctx: WorldCtx,
  candleId: string,
  locale: string,
): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  const [clock, config] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    readAppConfig(ctx.gateway),
  ]);
  const defaultCount = candleDefaultCount(config);
  if (!CANDLE_ID_PATTERN.test(candleId)) {
    throw new AppError('invalid_request', 'Unknown candle.');
  }
  await mutateWorldDoc(ctx, 'church', (doc) => {
    if (!presentCandles(doc, defaultCount).includes(candleId)) {
      throw new AppError('invalid_request', 'Unknown candle.');
    }
    const lit = doc.candles[clock.today] ?? [];
    doc.candles = { [clock.today]: lit.filter((id) => id !== candleId) };
  });
  return { ...(await getChurchState(ctx, locale)), rewards: [] };
}

/**
 * Adds one new, always-INITIALLY-UNLIT candle to a free tray position, up to the tray's capacity
 * (the original `church_candle_slots` count plus a modest Add headroom). Never awards anything by itself. The id is always freshly generated (`candle_a<n>`, a
 * per-player counter that never repeats), so it can never collide with an old, historically-lit or
 * occasion-preserved id — a genuinely new candle always starts dark. `clientRequestId` makes a retried
 * Add idempotent: replaying the same id returns the same resulting candle instead of a second one (the
 * client already collapses truly simultaneous double-taps into one in-flight request; this covers a
 * request that is retried after a dropped response).
 */
export async function addCandle(
  ctx: WorldCtx,
  clientRequestId: string,
  locale: string,
): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  const config = await readAppConfig(ctx.gateway);
  const capacity = candleCapacity(config);
  await mutateWorldDoc(ctx, 'church', (doc) => {
    materializeArrangement(doc, candleDefaultCount(config));
    if (doc.candleAddRequests[clientRequestId]) return; // idempotent replay: already added once
    if (doc.candlePresent.length >= capacity) {
      throw new AppError('invalid_request', 'The candle tray is full.');
    }
    doc.candleSeq += 1;
    const id = `candle_a${doc.candleSeq}`;
    doc.candlePresent.push(id);
    doc.candleAddRequests[clientRequestId] = id;
    const keys = Object.keys(doc.candleAddRequests);
    if (keys.length > ADD_REQUEST_HISTORY_LIMIT) delete doc.candleAddRequests[keys[0]!];
  });
  return { ...(await getChurchState(ctx, locale)), rewards: [] };
}

/**
 * Takes one candle out of the visible tray, including its flame. Reward and occasion history are never
 * touched — `candlesLitEver` and `preservedCandles` keep their historical values, so this can never
 * un-earn a key, and a later Add cannot re-earn one either (Add always makes a brand-new id, never a
 * reused one). Removing a candle that is already absent is a no-op (idempotent, safe to retry).
 */
export async function removeCandle(
  ctx: WorldCtx,
  candleId: string,
  locale: string,
): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  const config = await readAppConfig(ctx.gateway);
  const defaultCount = candleDefaultCount(config);
  if (!CANDLE_ID_PATTERN.test(candleId)) {
    throw new AppError('invalid_request', 'Unknown candle.');
  }
  await mutateWorldDoc(ctx, 'church', (doc) => {
    if (!presentCandles(doc, defaultCount).includes(candleId)) return;
    materializeArrangement(doc, defaultCount);
    doc.candlePresent = doc.candlePresent.filter((id) => id !== candleId);
  });
  return { ...(await getChurchState(ctx, locale)), rewards: [] };
}

/** Opens the day's Bible story, adding it to the permanent expanding gallery (idempotent). */
export async function openStory(
  ctx: WorldCtx,
  contentId: string,
  locale: string,
): Promise<ChurchStateResponse> {
  await assertLocationAccess(ctx, 'church');
  const [clock, content] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    ctx.gateway.readTab('30_CHURCH_CONTENT'),
  ]);
  const rows = content.rows.filter(
    (r) =>
      r.raw.content_id === contentId &&
      r.raw.content_type === 'story' &&
      isApproved(r) &&
      isScheduledDue(r.raw.active_date, clock),
  );
  if (rows.length === 0) throw new AppError('not_found', 'That story is not available.');
  await mutateWorldDoc(ctx, 'church', (doc) => {
    if (!doc.openedStories.includes(contentId)) doc.openedStories.push(contentId);
  });
  return getChurchState(ctx, locale);
}

/** Server-side achievement triggers for the quiz family (`trigger_type = quiz`). */
async function evaluateQuizAchievements(
  ctx: WorldCtx,
  doc: ChurchDoc,
  perfectToday: boolean,
  explicitIds: string[],
): Promise<WorldAchievementView[]> {
  const table = await ctx.gateway.readTab('23_ACHIEVEMENTS');
  const completedDays = Object.entries(doc.quiz)
    .filter(([, q]) => q.completed)
    .map(([day]) => day)
    .sort();
  const streak = (() => {
    let run = 0;
    let previous: number | null = null;
    for (const day of completedDays) {
      const t = Date.parse(`${day}T00:00:00Z`);
      run = previous !== null && t - previous === 86_400_000 ? run + 1 : 1;
      previous = t;
    }
    return run;
  })();
  const out: WorldAchievementView[] = [];
  const ids = new Set(explicitIds.filter((id) => usable(id)));
  for (const row of table.rows) {
    if (row.values.enabled !== true || row.raw.trigger_type !== 'quiz') continue;
    const rule = row.raw.trigger_rule_json;
    const needsPerfect = jsonNumber(rule, 'score_percent') === 100;
    const completedQuizzes = jsonNumber(rule, 'completed_quizzes');
    const streakDays = jsonNumber(rule, 'streak_days');
    let met = ids.has(row.primaryKeyValue ?? '') && (!needsPerfect || perfectToday);
    if (completedQuizzes !== null) met = completedDays.length >= completedQuizzes;
    if (streakDays !== null) met = streak >= streakDays;
    if (!met) continue;
    const outcome = await unlockAchievement(ctx, row.primaryKeyValue ?? '');
    if (outcome.applied) out.push({ ...outcome, keyReward: outcome.keyReward });
  }
  return out;
}

/**
 * Checks one quiz answer on the server (the correct answer never reaches the
 * browser before this). Wrong answers return the explanation and reference and
 * allow another attempt; a fully answered day completes the quiz once.
 */
export async function answerQuiz(
  ctx: WorldCtx,
  questionId: string,
  answer: string,
  locale: string,
): Promise<ChurchAnswerResponse> {
  await assertLocationAccess(ctx, 'church');
  const [clock, quiz] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    ctx.gateway.readTab('31_CHURCH_QUIZ'),
  ]);
  const grouped = questionRowsFor(quiz.rows, clock);
  const rows = (grouped.get(questionId) ?? []).filter(
    (r) =>
      r.values.enabled === true && r.raw.review_status === 'approved' && usable(r.raw.question),
  );
  const picked = pickLocaleRow(
    rows.map((r) => ({ locale: r.raw.locale ?? '', r })),
    locale,
  );
  if (!picked) throw new AppError('not_found', 'That question is not available today.');
  const row = picked.row.r;
  const correct = normalizeAnswer(answer) === normalizeAnswer(row.raw.correct_answer);
  const total = [...grouped.entries()].filter(([id]) => {
    const view = buildQuestion(
      id,
      grouped.get(id)!,
      locale,
      { quiz: {} } as ChurchDoc,
      clock.today,
    );
    return view !== null;
  });
  const requiredIds = total.map(([id]) => id);

  let rewards: WorldRewardView[] = [];
  let achievements: WorldAchievementView[] = [];
  const outcome = await mutateWorldDoc(ctx, 'church', async (doc) => {
    const day = (doc.quiz[clock.today] ??= {
      answered: [],
      wrong: 0,
      completed: false,
      perfect: false,
    });
    if (day.answered.includes(questionId)) return { fresh: false, completedNow: false };
    if (!correct) {
      day.wrong += 1;
      return { fresh: true, completedNow: false };
    }
    day.answered.push(questionId);
    const done = requiredIds.every((id) => day.answered.includes(id));
    if (done && !day.completed) {
      day.completed = true;
      day.perfect = day.wrong === 0;
      return { fresh: true, completedNow: true };
    }
    return { fresh: true, completedNow: false };
  });

  if (outcome.result.completedNow) {
    // The quiz key comes from the reviewed question rows (`key_reward_type_id`), once per day.
    const keyTypes = new Set(
      rows.map((r) => r.raw.key_reward_type_id ?? '').filter((k) => usable(k)),
    );
    for (const keyTypeId of keyTypes) {
      const award = await awardKey(ctx.gateway, ctx.mutex, {
        userId: ctx.userId,
        keyTypeId,
        quantity: 1,
        transactionId: `church_quiz:${clock.today}`,
        now: ctx.now,
      });
      rewards.push({
        ruleId: `church_quiz:${clock.today}`,
        keyTypeId,
        quantity: 1,
        applied: award.applied,
        reason: award.applied
          ? 'awarded'
          : award.reason === 'daily_cap_reached'
            ? 'cap_deferred'
            : 'already_claimed',
      });
    }
    const dayDoc = outcome.doc.quiz[clock.today]!;
    const achievementIds = [...grouped.values()].flat().map((r) => r.raw.achievement_id ?? '');
    achievements = await evaluateQuizAchievements(ctx, outcome.doc, dayDoc.perfect, achievementIds);
  }
  rewards = rewards.filter((r) => r.applied);
  const state = await getChurchState(ctx, locale);
  const day = state.quiz;
  return {
    ok: true,
    correct,
    explanation: usable(row.raw.explanation) ? row.raw.explanation! : '',
    reference: usable(row.raw.bible_reference) ? row.raw.bible_reference! : '',
    completed: day.completed,
    perfect: day.perfect,
    state: { ...state, rewards, achievements },
  };
}
