import { describe, expect, it } from 'vitest';
import { getTriviaQuestions, submitTriviaAnswer } from '../src/world/arcade-trivia.js';
import { buildWorldWorkbook, worldCtx, worldGateway } from './helpers/world-fixture.js';
import {
  addArcadeContent,
  addArcadeTriviaContent,
  unlockThrough,
} from './helpers/world-fixture-extra.js';

const build = () =>
  buildWorldWorkbook((wb) => {
    addArcadeContent(wb);
    addArcadeTriviaContent(wb);
  });

/** `addArcadeContent`'s default `game_trivia` row is disabled/locked (matches the real Sheet before this
 * pass); these tests exercise the cabinet once it's enabled and free to enter, which is what this pass
 * flips it to. */
async function at() {
  const gateway = worldGateway(build());
  const ctx = worldCtx(gateway);
  await unlockThrough(ctx, 'beat_11_cottage'); // past the Arcade beat, so /arcade is accessible
  await gateway.updateByPrimaryKey('32_ARCADE_GAMES', 'game_trivia', {
    enabled: 'TRUE',
    key_cost_type_id: '',
    key_cost_quantity: '0',
  });
  return { gateway, ctx };
}

describe('Arcade Trivia', () => {
  it('never sends correct_answer to the client, and resolves the requested locale', async () => {
    const { ctx } = await at();
    const en = await getTriviaQuestions(ctx, 'game_trivia', 'en');
    expect(en.questions.length).toBeGreaterThan(0);
    expect(JSON.stringify(en)).not.toContain('correct_answer');
    const mc = en.questions.find((q) => q.questionType === 'multiple_choice')!;
    expect(mc.options.map((o) => o.text)).toContain('Sunflower');

    const ar = await getTriviaQuestions(ctx, 'game_trivia', 'ar-EG');
    const arMc = ar.questions.find((q) => q.questionId === mc.questionId)!;
    expect(arMc.locale).toBe('ar-EG');
    expect(arMc.direction).toBe('rtl');
  });

  it('excludes a disabled (not-yet-reviewed) question entirely', async () => {
    const { ctx } = await at();
    const en = await getTriviaQuestions(ctx, 'game_trivia', 'en');
    expect(en.questions.some((q) => q.questionId === 'triv_3_disabled')).toBe(false);
  });

  it('validates a multiple-choice answer server-side and returns the explanation', async () => {
    const { ctx } = await at();
    const correct = await submitTriviaAnswer(ctx, 'game_trivia', 'triv_1', 'a', 'en');
    expect(correct).toMatchObject({
      correct: true,
      explanation: 'The Farm key is sunflower-shaped.',
    });
    const wrong = await submitTriviaAnswer(ctx, 'game_trivia', 'triv_1', 'b', 'en');
    expect(wrong.correct).toBe(false);
  });

  it('validates a true/false answer case-insensitively', async () => {
    const { ctx } = await at();
    const outcome = await submitTriviaAnswer(ctx, 'game_trivia', 'triv_2', 'TRUE', 'en');
    expect(outcome.correct).toBe(true);
  });

  it('refuses an unknown or disabled question id', async () => {
    const { ctx } = await at();
    await expect(
      submitTriviaAnswer(ctx, 'game_trivia', 'triv_3_disabled', 'true', 'en'),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(submitTriviaAnswer(ctx, 'game_trivia', 'nope', 'a', 'en')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses trivia endpoints while the cabinet is still disabled/locked', async () => {
    const gateway = worldGateway(build());
    const ctx = worldCtx(gateway);
    await unlockThrough(ctx, 'beat_11_cottage');
    await expect(getTriviaQuestions(ctx, 'game_trivia', 'en')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
