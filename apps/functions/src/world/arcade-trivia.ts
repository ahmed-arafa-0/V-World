import type {
  TriviaAnswerResponse,
  TriviaQuestionsResponse,
  TriviaQuestionView,
} from '@veoullas-world/contracts';
import type { NormalizedRow } from '@veoullas-world/sheet-schema';
import { AppError } from '../errors/app-error.js';
import { getArcadeState } from './arcade.js';
import { assertLocationAccess } from './journey.js';
import { directionFor, groupBy, pickLocaleRow, usable, type WorldCtx } from './common.js';

/** Confirms the Trivia cabinet is actually installed and unlocked — the same guard `recordAttempt` applies, so a disabled/locked cabinet can never be played through these standalone endpoints either. */
async function assertTriviaCabinet(ctx: WorldCtx, gameId: string): Promise<void> {
  const state = await getArcadeState(ctx);
  const game = state.games.find((g) => g.gameId === gameId);
  if (!game || !game.installed) throw new AppError('not_found', 'That machine is not installed.');
  if (!game.unlocked) throw new AppError('WORLD_LOCKED', 'That machine is still locked.');
}

const LETTERS = ['a', 'b', 'c', 'd'] as const;
const QUESTIONS_PER_ROUND = 5;

/**
 * The Arcade Trivia question bank (`42_ARCADE_TRIVIA`) — a distinct tab from
 * the Church's `31_CHURCH_QUIZ`, never mixed. Unlike the Church quiz (which
 * additionally requires `review_status: 'approved'` before a question is
 * ever shown), Trivia only requires `enabled: 'TRUE'`: Ahmed chose to launch
 * the cabinet now with a starter, still-under-review question bank rather
 * than keep it dark, so `review_status` here is informational only (visible
 * in the Sheet for his later cleanup pass), never a display gate.
 */
function buildTriviaQuestion(
  questionId: string,
  rows: NormalizedRow[],
  locale: string,
): TriviaQuestionView | null {
  const enabled = rows.filter((r) => usable(r.raw.question));
  const picked = pickLocaleRow(
    enabled.map((r) => ({ locale: r.raw.locale ?? '', r })),
    locale,
  );
  if (!picked) return null;
  const r = picked.row.r;
  const type = r.raw.question_type === 'true_false' ? 'true_false' : 'multiple_choice';
  let options: { id: string; text: string }[];
  if (type === 'true_false') {
    // True/False labels are localized interface text the client already renders (`trivia_*`).
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
  };
}

/** A deterministic-per-call shuffle (Fisher–Yates) so an injected `random` keeps tests stable. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A fresh round of Trivia questions — never the correct answer. */
export async function getTriviaQuestions(
  ctx: WorldCtx,
  gameId: string,
  locale: string,
  random: () => number = Math.random,
): Promise<TriviaQuestionsResponse> {
  await assertLocationAccess(ctx, 'arcade');
  await assertTriviaCabinet(ctx, gameId);
  const table = await ctx.gateway.readTab('42_ARCADE_TRIVIA');
  const enabledRows = table.rows.filter((r) => r.values.enabled === true);
  const grouped = groupBy(enabledRows, (r) => r.raw.question_id ?? '');
  const questions = shuffle([...grouped.entries()], random)
    .map(([id, rows]) => buildTriviaQuestion(id, rows, locale))
    .filter((q): q is TriviaQuestionView => q !== null)
    .slice(0, QUESTIONS_PER_ROUND);
  return { ok: true, questions };
}

function normalizeAnswer(value: string | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 't') return 'true';
  if (v === 'f') return 'false';
  return v;
}

/** Validates one answer server-side against the Sheet's `correct_answer` — never trusted from the client. */
export async function submitTriviaAnswer(
  ctx: WorldCtx,
  gameId: string,
  questionId: string,
  answer: string,
  locale: string,
): Promise<TriviaAnswerResponse> {
  await assertLocationAccess(ctx, 'arcade');
  await assertTriviaCabinet(ctx, gameId);
  const table = await ctx.gateway.readTab('42_ARCADE_TRIVIA');
  const rows = table.rows.filter(
    (r) => r.values.enabled === true && r.raw.question_id === questionId && usable(r.raw.question),
  );
  const picked = pickLocaleRow(
    rows.map((r) => ({ locale: r.raw.locale ?? '', r })),
    locale,
  );
  if (!picked) throw new AppError('not_found', 'That question is not available.');
  const row = picked.row.r;
  const correct = normalizeAnswer(answer) === normalizeAnswer(row.raw.correct_answer);
  return {
    ok: true,
    correct,
    explanation: usable(row.raw.explanation) ? row.raw.explanation! : '',
  };
}
