#!/usr/bin/env node
/**
 * Imports `assets/Veoulla_Content_Banks_v1/` (47 new stories, 300 verses, 1000 messages) and
 * schedules-and-activates the `assets/Veoulla_Content_Completion_v1/` 316-question quiz bank, plus
 * reconciles the earlier content-completion package (16 dialogue groups, 293 UI-text rows, the 3
 * already-translated Bible stories). Ahmed explicitly authorized this specific live import/activation
 * (does not touch the church-verse-replacement, which stays skipped — the live Birthday Verse row is
 * preserved untouched).
 *
 * Default is --preview (prints exact row counts + one sample per tab; writes nothing). --apply
 * performs the live appends. Every append below is idempotent by primary key
 * (`appendRowsIfAbsent`) — safe to re-run.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  getAuthoritativeTimeZone,
  calendarDateKey,
} from '../apps/functions/lib/services/authoritative-time.service.js';
import {
  buildScheduleDates,
  buildContentBankStoryRows,
  buildContentBankVerseRows,
  buildContentBankMessageRows,
  buildScheduledQuizRows,
  seedContentBankStories,
  seedContentBankVerses,
  seedContentBankMessages,
  seedScheduledQuizRows,
} from '../apps/functions/lib/services/content-banks-v1-seed.service.js';
import {
  seedDialogueGroupProposals,
  DIALOGUE_GROUP_PROPOSALS,
} from '../apps/functions/lib/services/content-completion-v1-dialogue-seed.service.js';
import {
  seedContentCompletionUiText,
  buildBeatTitleRows,
  buildUiTextLabelRows,
  buildUiMapFillRows,
} from '../apps/functions/lib/services/content-completion-v1-ui-text-seed.service.js';
import {
  seedChurchStoryProposals,
  CHURCH_STORY_PROPOSALS,
} from '../apps/functions/lib/services/content-completion-v1-church-seed.service.js';
import fs from 'node:fs';

const apply = process.argv.includes('--apply');

const stories = JSON.parse(
  fs.readFileSync(
    new URL('../assets/Veoulla_Content_Banks_v1/stories_50_ar.json', import.meta.url),
  ),
).stories;
const messages = JSON.parse(
  fs.readFileSync(
    new URL('../assets/Veoulla_Content_Banks_v1/messages_1000_ar.json', import.meta.url),
  ),
).messages;
const verses = JSON.parse(
  fs.readFileSync(
    new URL('../assets/Veoulla_Content_Banks_v1/verses_300_ar.json', import.meta.url),
  ),
).verses;
const quizBank = JSON.parse(
  fs.readFileSync(
    new URL(
      '../assets/Veoulla_Content_Completion_v1/quiz_import_preview_316_ar.json',
      import.meta.url,
    ),
  ),
).rows;
const quizStarter = JSON.parse(
  fs.readFileSync(
    new URL(
      '../assets/Veoulla_Content_Completion_v1/quiz_starter_6_5_locales.json',
      import.meta.url,
    ),
  ),
).rows;
const quizSchedule = JSON.parse(
  fs.readFileSync(
    new URL('../assets/Veoulla_Content_Completion_v1/quiz_schedule_proposal.json', import.meta.url),
  ),
).days;

const sheetsClient = createGoogleSheetsClientOrNull();
if (!sheetsClient) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 60 });

const timeZone = await getAuthoritativeTimeZone(gateway, { bypass: true });
const today = calendarDateKey(new Date(), timeZone);
const startDate = calendarDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000), timeZone);
// The live Birthday Verse (church_verse_001) is dated 2026-09-26 — never schedule generic
// daily content on that date, on any of these three rotations.
const SKIP_DATES = new Set(['2026-09-26']);

console.log(`Authoritative timezone: ${timeZone}; today: ${today}; schedule starts: ${startDate}`);

const newStoryCount = stories.filter((s) => s.origin !== 'previous_3_preserved').length;
const storyDates = buildScheduleDates(startDate, newStoryCount, SKIP_DATES);
const verseDates = buildScheduleDates(startDate, verses.length, SKIP_DATES);
const normalMessages = messages.filter((m) => !m.occasion_only);
const messageDates = buildScheduleDates(startDate, normalMessages.length, SKIP_DATES);

const storyRows = buildContentBankStoryRows(stories, storyDates);
const verseRows = buildContentBankVerseRows(verses, verseDates);
const messageRows = buildContentBankMessageRows(messages, messageDates);
const quizRows = buildScheduledQuizRows(quizBank, quizStarter, quizSchedule, startDate);

console.log('\n--- Preview counts ---');
console.log(
  `Stories (30_CHURCH_CONTENT, new): ${storyRows.length} (skipping ${stories.length - newStoryCount} already-preserved)`,
);
console.log(`Verses (30_CHURCH_CONTENT): ${verseRows.length}`);
console.log(
  `Messages (19_MESSAGES): ${messageRows.length} (${normalMessages.length} scheduled daily, ${messages.length - normalMessages.length} occasion-only, unscheduled)`,
);
console.log(
  `Quiz (31_CHURCH_QUIZ): ${quizRows.length} (${quizRows.filter((r) => r.enabled === 'TRUE').length} scheduled/enabled, ${quizRows.filter((r) => r.enabled !== 'TRUE').length} reserved/undated)`,
);
console.log(
  `Dialogue (15_DIALOGUE, content-completion-v1 reconciliation): ${DIALOGUE_GROUP_PROPOSALS.length} groups`,
);
const uiTextRowCount =
  buildBeatTitleRows().length + buildUiTextLabelRows().length + buildUiMapFillRows().length;
console.log(`UI text (08_UI_TEXT, content-completion-v1 reconciliation): ${uiTextRowCount} rows`);
console.log(
  `3 preserved stories (30_CHURCH_CONTENT, content-completion-v1 reconciliation): ${CHURCH_STORY_PROPOSALS.length} stories x 5 locales`,
);

console.log('\n--- Sample rows ---');
console.log('Story sample:', JSON.stringify(storyRows[0], null, 2));
console.log('Verse sample:', JSON.stringify(verseRows[0], null, 2));
console.log(
  'Normal message sample:',
  JSON.stringify(
    messageRows.find((r) => r.enabled === 'TRUE'),
    null,
    2,
  ),
);
console.log(
  'Occasion message sample:',
  JSON.stringify(
    messageRows.find((r) => r.enabled === 'FALSE'),
    null,
    2,
  ),
);
console.log(
  'Scheduled quiz sample:',
  JSON.stringify(
    quizRows.find((r) => r.enabled === 'TRUE'),
    null,
    2,
  ),
);
console.log(
  'Reserved quiz sample:',
  JSON.stringify(
    quizRows.find((r) => r.enabled !== 'TRUE'),
    null,
    2,
  ),
);

if (!apply) {
  console.log('\nPreview only — no writes performed. Re-run with --apply to write live.');
  process.exit(0);
}

console.log('\n--- Applying live writes (idempotent appends) ---');
const results = {};
results.dialogue = await seedDialogueGroupProposals(gateway);
results.uiText = await seedContentCompletionUiText(gateway);
results.preservedStories = await seedChurchStoryProposals(gateway);
results.stories = await seedContentBankStories(gateway, stories, storyDates);
results.verses = await seedContentBankVerses(gateway, verses, verseDates);
results.messages = await seedContentBankMessages(gateway, messages, messageDates);
results.quiz = await seedScheduledQuizRows(gateway, quizBank, quizStarter, quizSchedule, startDate);

for (const [name, result] of Object.entries(results)) {
  console.log(
    `${name}: created ${result.created.length}, already existing ${result.existing.length}`,
  );
}
console.log('\nDone. No commit, push, or deploy performed by this script.');
