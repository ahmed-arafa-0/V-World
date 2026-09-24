import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Imports the reviewed 316-question Arabic Bible-quiz bank
 * (`assets/Veoulla_Content_Completion_v1/quiz_import_preview_316_ar.json`, already schema-mapped
 * per `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md` §4) plus the 6-question, 5-locale starter set
 * (`quiz_starter_6_5_locales.json`) into `31_CHURCH_QUIZ`.
 *
 * This module performs content insertion ONLY. It deliberately does NOT resolve
 * `docs/content/QUIZ_BANK_INTEGRATION_PREVIEW.md` §5.1 (the 316→dated-rows scheduling decision):
 * every row is appended with `active_date` BLANK and `enabled: 'FALSE'`, so importing the wording
 * cannot itself put any question in front of a player. Assigning `active_date` per
 * `quiz_schedule_proposal.json` (or any other schedule) and flipping `enabled` are separate,
 * later, explicit actions once Ahmed picks a start day.
 *
 * `review_status: 'pending_review'` and `achievement_id`/`key_reward_type_id`:
 * `ach_perfect_quiz`/`key_candle` are carried over UNCHANGED from the package's own
 * already-schema-mapped preview file, which itself mirrors the one live template row
 * (`quiz_001_en`/`quiz_001_ar`, read 2026-09-22) — no reward rule, quantity, cap or achievement
 * trigger is changed. Confirm with Ahmed before activation per the companion document's §5.2/§5.4;
 * this seed does not gate on that confirmation because reusing the current template's own values
 * is not itself a new decision.
 *
 * The starter set's 6 Arabic rows are byte-identical duplicates of 6 rows already in the 316 bank
 * (verified 2026-09-22) — `appendRowsIfAbsent`'s primary-key dedupe means only the starter's 4 new
 * locales (`en`/`it`/`el`/`fr`) per question are ever actually inserted, never a duplicate Arabic row.
 */

export interface QuizBankSourceRow {
  question_row_id: string;
  question_id: string;
  active_date: string | null;
  locale: string;
  question: string;
  question_type: 'multiple_choice' | 'true_false';
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  bible_reference: string;
  achievement_id: string;
  key_reward_type_id: string;
  enabled: boolean;
  review_status: string;
}

function toSheetRow(source: QuizBankSourceRow): Record<string, string> {
  if (source.enabled) {
    throw new Error(`Refusing to seed an already-enabled quiz row: ${source.question_row_id}`);
  }
  if (source.active_date) {
    throw new Error(
      `Refusing to seed a quiz row with a pre-assigned active_date (scheduling is Ahmed's decision): ${source.question_row_id}`,
    );
  }
  return {
    question_row_id: source.question_row_id,
    question_id: source.question_id,
    active_date: '',
    locale: source.locale,
    question: source.question,
    question_type: source.question_type,
    option_a: source.option_a,
    option_b: source.option_b,
    option_c: source.option_c,
    option_d: source.option_d,
    correct_answer: source.correct_answer,
    explanation: source.explanation,
    bible_reference: source.bible_reference,
    achievement_id: source.achievement_id,
    key_reward_type_id: source.key_reward_type_id,
    enabled: 'FALSE',
    review_status: source.review_status,
  };
}

/**
 * Merges the 316-question bank with the 6-question starter set's extra locales, deduping by
 * `question_row_id` (bank wins on any overlap — verified identical for the 6 shared Arabic rows).
 */
export function buildQuizBankRows(
  bankRows: readonly QuizBankSourceRow[],
  starterRows: readonly QuizBankSourceRow[] = [],
): Record<string, string>[] {
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];
  for (const source of [...bankRows, ...starterRows]) {
    if (seen.has(source.question_row_id)) continue;
    seen.add(source.question_row_id);
    rows.push(toSheetRow(source));
  }
  return rows;
}

/**
 * Idempotent and append-only: an existing `question_row_id` — including the live template rows
 * `quiz_001_en`/`quiz_001_ar` — is never touched. Every appended row is undated and `enabled:
 * 'FALSE'`.
 */
export async function seedQuizBankRows(
  gateway: SheetGateway,
  bankRows: readonly QuizBankSourceRow[],
  starterRows: readonly QuizBankSourceRow[] = [],
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent('31_CHURCH_QUIZ', buildQuizBankRows(bankRows, starterRows));
}
