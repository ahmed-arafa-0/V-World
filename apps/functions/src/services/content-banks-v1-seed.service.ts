import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * `assets/Veoulla_Content_Banks_v1/` (50 stories, 1000 messages, 300 verses) plus a scheduled
 * activation pass for the already-built `assets/Veoulla_Content_Completion_v1/` 316-question quiz
 * bank. Ahmed authorized this specific import/activation directly (2026-09-26 conversation),
 * superseding the earlier CODEX handoff's "no live writes authorized by this handoff alone" note
 * for this content only. His own framing: "authorized for import/use by Ahmed, but not individually
 * manually reviewed" — recorded honestly below as `review_status: 'approved'` (the only Sheet value
 * that `church.ts`'s `isApproved()` actually renders; `39_VALIDATION_LISTS.review_status` has no
 * fifth "authorized but unreviewed" state), never as a claim that each sentence was edited.
 *
 * All content here is Arabic-only (`ar-EG`), per the bank's own sourcing notes — no English/Italian/
 * Greek/French rows are invented to fill locale gaps; `pickLocaleRow()` already degrades honestly for
 * non-Arabic players.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function addDaysUTC(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * ONE_DAY_MS);
  return next.toISOString().slice(0, 10);
}

/** Walks forward one calendar day at a time from `startDateKey`, skipping any date in `skip` (e.g. the Birthday Verse's 2026-09-26), until `count` dates are collected. */
export function buildScheduleDates(
  startDateKey: string,
  count: number,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  const dates: string[] = [];
  let cursor = startDateKey;
  let guard = 0;
  while (dates.length < count) {
    if (!skip.has(cursor)) dates.push(cursor);
    cursor = addDaysUTC(cursor, 1);
    guard += 1;
    if (guard > count + skip.size + 10) {
      throw new Error('buildScheduleDates: unexpected non-termination');
    }
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Stories — 30_CHURCH_CONTENT, content_type: 'story'
// ---------------------------------------------------------------------------

export interface ContentBankStorySource {
  story_id: string;
  locale: string;
  title: string;
  text: string;
  reference: string;
  source_url: string;
  origin: string;
  enabled: boolean;
  review_status: string;
}

/** Only the 47 genuinely new stories; the 3 `origin: 'previous_3_preserved'` stories are already seeded with full 5-locale translations by `content-completion-v1-church-seed.service.ts` (`CHURCH_STORY_PROPOSALS`) and must not be re-inserted Arabic-only here (that would be a downgrade, not a duplicate-avoidance no-op — `appendRowsIfAbsent` would simply skip them anyway since the row ids collide, but filtering here keeps the row count/preview honest). */
export function buildContentBankStoryRows(
  stories: readonly ContentBankStorySource[],
  activeDates: readonly string[],
): Record<string, string>[] {
  const newStories = stories.filter((s) => s.origin !== 'previous_3_preserved');
  if (newStories.length !== activeDates.length) {
    throw new Error(
      `buildContentBankStoryRows: expected ${newStories.length} schedule dates, got ${activeDates.length}`,
    );
  }
  return newStories.map((story, i) => ({
    content_row_id: `${story.story_id}_ar`,
    content_id: story.story_id,
    content_type: 'story',
    active_date: activeDates[i]!,
    locale: 'ar-EG',
    title: story.title,
    text: story.text,
    direction: 'rtl',
    image_asset_ids: '',
    voiceover_id: '',
    bible_reference: story.reference,
    source_url: story.source_url,
    review_status: 'approved',
    enabled: 'TRUE',
  }));
}

export async function seedContentBankStories(
  gateway: SheetGateway,
  stories: readonly ContentBankStorySource[],
  activeDates: readonly string[],
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent(
    '30_CHURCH_CONTENT',
    buildContentBankStoryRows(stories, activeDates),
  );
}

// ---------------------------------------------------------------------------
// Verses — 30_CHURCH_CONTENT, content_type: 'verse'
// ---------------------------------------------------------------------------

export interface ContentBankVerseSource {
  verse_id: string;
  locale: string;
  text: string;
  reference: string;
}

/** Verse `text` is copied exactly from the Van Dyck (`ar_svd`) source — never paraphrased. Distinct `verse_id`s from `church_verse_001` (the live Birthday Verse), never scheduled on its 2026-09-26 date. */
export function buildContentBankVerseRows(
  verses: readonly ContentBankVerseSource[],
  activeDates: readonly string[],
): Record<string, string>[] {
  if (verses.length !== activeDates.length) {
    throw new Error(
      `buildContentBankVerseRows: expected ${verses.length} schedule dates, got ${activeDates.length}`,
    );
  }
  return verses.map((v, i) => ({
    content_row_id: v.verse_id,
    content_id: v.verse_id,
    content_type: 'verse',
    active_date: activeDates[i]!,
    locale: 'ar-EG',
    title: '',
    text: v.text,
    direction: 'rtl',
    image_asset_ids: '',
    voiceover_id: '',
    bible_reference: v.reference,
    source_url: '',
    review_status: 'approved',
    enabled: 'TRUE',
  }));
}

export async function seedContentBankVerses(
  gateway: SheetGateway,
  verses: readonly ContentBankVerseSource[],
  activeDates: readonly string[],
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent(
    '30_CHURCH_CONTENT',
    buildContentBankVerseRows(verses, activeDates),
  );
}

// ---------------------------------------------------------------------------
// Messages — 19_MESSAGES
// ---------------------------------------------------------------------------

export interface ContentBankMessageSource {
  draft_id: string;
  locale: string;
  category: string;
  text: string;
  kind: string;
  occasion_only: boolean;
}

/**
 * 950 normal messages get a real `recipient_user_id: 'veoulla'` (never blank — a blank recipient
 * means "everyone", which would also reach an isolated test/review account) and a rolling
 * `delivery_at` date (one per day by default, round-robin across categories for early variety). The
 * 50 `occasion_only` (celebration) messages are inserted with `delivery_at` and `enabled` left
 * unset/false — explicit occasion scheduling is a separate, later action, never ordinary daily
 * delivery.
 */
export function buildContentBankMessageRows(
  messages: readonly ContentBankMessageSource[],
  normalDeliveryDates: readonly string[],
): Record<string, string>[] {
  const normal = messages.filter((m) => !m.occasion_only);
  const occasion = messages.filter((m) => m.occasion_only);
  if (normal.length !== normalDeliveryDates.length) {
    throw new Error(
      `buildContentBankMessageRows: expected ${normal.length} schedule dates, got ${normalDeliveryDates.length}`,
    );
  }
  const normalRows = normal.map((m, i) => ({
    message_row_id: m.draft_id,
    message_id: m.draft_id,
    sender_id: 'admin_ahmed',
    recipient_user_id: 'veoulla',
    delivery_at: normalDeliveryDates[i]!,
    priority: '',
    message_type: 'letter',
    locale: 'ar-EG',
    text: m.text,
    direction: 'rtl',
    image_asset_ids: '',
    voiceover_id: '',
    gift_ids: '',
    translation_group_id: '',
    archive_after_open: 'TRUE',
    enabled: 'TRUE',
    notes: `content_bank_v1;category:${m.category};kind:${m.kind}`,
  }));
  const occasionRows = occasion.map((m) => ({
    message_row_id: m.draft_id,
    message_id: m.draft_id,
    sender_id: 'admin_ahmed',
    recipient_user_id: 'veoulla',
    delivery_at: '',
    priority: '',
    message_type: 'letter',
    locale: 'ar-EG',
    text: m.text,
    direction: 'rtl',
    image_asset_ids: '',
    voiceover_id: '',
    gift_ids: '',
    translation_group_id: '',
    archive_after_open: 'TRUE',
    enabled: 'FALSE',
    notes: `content_bank_v1;category:${m.category};kind:${m.kind};occasion_only`,
  }));
  return [...normalRows, ...occasionRows];
}

export async function seedContentBankMessages(
  gateway: SheetGateway,
  messages: readonly ContentBankMessageSource[],
  normalDeliveryDates: readonly string[],
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent(
    '19_MESSAGES',
    buildContentBankMessageRows(messages, normalDeliveryDates),
  );
}

// ---------------------------------------------------------------------------
// Quiz bank scheduling — 31_CHURCH_QUIZ (supersedes the undated
// content-completion-v1-quiz-seed.service.ts insert with Ahmed's now-resolved schedule)
// ---------------------------------------------------------------------------

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

export interface QuizScheduleDay {
  relative_day: number;
  question_ids: string[];
}

/**
 * Applies `quiz_schedule_proposal.json`'s own fixed 50-day rotation (unchanged mix, unchanged
 * `ach_perfect_quiz`/`key_candle` reward) to the 300 new questions, using the authoritative game
 * clock's date for relative day 1 (never the package's creation date or the machine clock). The 16
 * `reserve_previous_16` questions stay unscheduled/disabled, exactly as that proposal names them —
 * not a recommendation this function invents. A question absent from the schedule (including any
 * unrecognized id) is inserted undated/disabled/`pending_review`, never guessed into a date.
 */
export function buildScheduledQuizRows(
  bankRows: readonly QuizBankSourceRow[],
  starterRows: readonly QuizBankSourceRow[],
  schedule: readonly QuizScheduleDay[],
  scheduleStartDate: string,
): Record<string, string>[] {
  const dateByQuestionId = new Map<string, string>();
  for (const day of schedule) {
    const date = addDaysUTC(scheduleStartDate, day.relative_day - 1);
    for (const id of day.question_ids) dateByQuestionId.set(id, date);
  }
  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];
  for (const source of [...bankRows, ...starterRows]) {
    if (source.enabled || source.active_date) {
      throw new Error(
        `Refusing to schedule an already-enabled/dated source row: ${source.question_row_id}`,
      );
    }
    if (seen.has(source.question_row_id)) continue;
    seen.add(source.question_row_id);
    const scheduledDate = dateByQuestionId.get(source.question_id);
    rows.push({
      question_row_id: source.question_row_id,
      question_id: source.question_id,
      active_date: scheduledDate ?? '',
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
      enabled: scheduledDate ? 'TRUE' : 'FALSE',
      review_status: scheduledDate ? 'approved' : 'pending_review',
    });
  }
  return rows;
}

export async function seedScheduledQuizRows(
  gateway: SheetGateway,
  bankRows: readonly QuizBankSourceRow[],
  starterRows: readonly QuizBankSourceRow[],
  schedule: readonly QuizScheduleDay[],
  scheduleStartDate: string,
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent(
    '31_CHURCH_QUIZ',
    buildScheduledQuizRows(bankRows, starterRows, schedule, scheduleStartDate),
  );
}
