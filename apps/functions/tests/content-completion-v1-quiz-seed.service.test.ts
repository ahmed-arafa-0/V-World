import { describe, expect, it } from 'vitest';
import type { QuizBankSourceRow } from '../src/services/content-completion-v1-quiz-seed.service.js';
import {
  buildQuizBankRows,
  seedQuizBankRows,
} from '../src/services/content-completion-v1-quiz-seed.service.js';
import { buildWorldWorkbook, worldGateway } from './helpers/world-fixture.js';

function q(
  id: string,
  locale: string,
  overrides: Partial<QuizBankSourceRow> = {},
): QuizBankSourceRow {
  return {
    question_row_id: `${id}_${locale === 'ar-EG' ? 'ar' : locale}`,
    question_id: id,
    active_date: null,
    locale,
    question: `Question ${id} ${locale}`,
    question_type: 'true_false',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_answer: 'true',
    explanation: '',
    bible_reference: 'GEN 1:1',
    achievement_id: 'ach_perfect_quiz',
    key_reward_type_id: 'key_candle',
    enabled: false,
    review_status: 'pending_review',
    ...overrides,
  };
}

describe('Content Completion v1 — quiz bank seed', () => {
  it('builds one row per source row, blank active_date, disabled', () => {
    const bank = [q('vw_bible_easy_tf_001', 'ar-EG')];
    const rows = buildQuizBankRows(bank);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.active_date).toBe('');
    expect(rows[0]?.enabled).toBe('FALSE');
  });

  it('merges the starter set without duplicating the shared Arabic row', () => {
    const bank = [q('vw_bible_easy_mc_025', 'ar-EG')];
    const starter = [
      q('vw_bible_easy_mc_025', 'ar-EG'), // byte-identical duplicate, per the package
      q('vw_bible_easy_mc_025', 'en'),
      q('vw_bible_easy_mc_025', 'it'),
      q('vw_bible_easy_mc_025', 'el'),
      q('vw_bible_easy_mc_025', 'fr'),
    ];
    const rows = buildQuizBankRows(bank, starter);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.question_row_id)).size).toBe(5);
  });

  it('refuses to seed an already-enabled or pre-dated source row', () => {
    expect(() => buildQuizBankRows([q('x', 'ar-EG', { enabled: true })])).toThrow(
      'already-enabled',
    );
    expect(() => buildQuizBankRows([q('x', 'ar-EG', { active_date: '2026-10-01' })])).toThrow(
      'pre-assigned active_date',
    );
  });

  it('is idempotent and never touches the live template rows', async () => {
    const gateway = worldGateway(buildWorldWorkbook());
    await gateway.appendRow('31_CHURCH_QUIZ', {
      question_row_id: 'quiz_001_en',
      question_id: 'quiz_001',
      active_date: '2026-09-26',
      locale: 'en',
      question: '<REVIEWED QUESTION>',
      question_type: 'multiple_choice',
      correct_answer: 'A',
      enabled: 'FALSE',
      review_status: 'pending_review',
    });

    const bank = [q('vw_bible_easy_tf_001', 'ar-EG'), q('vw_bible_easy_mc_002', 'ar-EG')];
    const first = await seedQuizBankRows(gateway, bank);
    expect(first.created).toHaveLength(2);
    const second = await seedQuizBankRows(gateway, bank);
    expect(second.created).toEqual([]);

    const template = await gateway.findByPrimaryKey('31_CHURCH_QUIZ', 'quiz_001_en', {
      bypass: true,
    });
    expect(template?.row.raw.question).toBe('<REVIEWED QUESTION>');
  });
});
