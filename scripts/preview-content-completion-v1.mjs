#!/usr/bin/env node
/**
 * READ-ONLY dry-run preview for the `Veoulla_Content_Completion_v1` package.
 *
 * Builds every proposed row via the pure `build*Rows()` functions in
 * `apps/functions/src/services/content-completion-v1-*-seed.service.ts`, diffs them against a
 * bounded, batched, already-captured live-Sheet snapshot (`scripts/inspect-real-content-gaps.mjs`'s
 * output), and reports exact created-vs-existing counts and any primary-key collisions.
 *
 * This script calls NO gateway write method and NO `seed*()` function — it only calls the `build*`
 * functions (pure, no I/O) and a local Set-based diff. Nothing is appended, updated or enabled.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildDialogueGroupRows } from '../apps/functions/lib/services/content-completion-v1-dialogue-seed.service.js';
import {
  buildBeatTitleRows,
  buildUiTextLabelRows,
  buildUiMapFillRows,
} from '../apps/functions/lib/services/content-completion-v1-ui-text-seed.service.js';
import { buildChurchStoryRows } from '../apps/functions/lib/services/content-completion-v1-church-seed.service.js';
import { buildQuizBankRows } from '../apps/functions/lib/services/content-completion-v1-quiz-seed.service.js';

const snapshotPath = process.argv[2];
if (!snapshotPath) {
  console.error('Usage: node scripts/preview-content-completion-v1.mjs <raw-snapshot.json>');
  process.exit(1);
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

function existingKeys(tab, pkColumn) {
  return new Set((snapshot[tab]?.rows ?? []).map((r) => r[pkColumn]));
}

function diff(tab, pkColumn, rows) {
  const existing = existingKeys(tab, pkColumn);
  const created = [];
  const alreadyLive = [];
  const seenInBatch = new Set();
  const duplicatesInBatch = [];
  for (const row of rows) {
    const key = row[pkColumn];
    if (existing.has(key)) {
      alreadyLive.push(key);
      continue;
    }
    if (seenInBatch.has(key)) {
      duplicatesInBatch.push(key);
      continue;
    }
    seenInBatch.add(key);
    created.push(key);
  }
  return { tab, proposedRowCount: rows.length, created, alreadyLive, duplicatesInBatch };
}

const dialogue = diff('15_DIALOGUE', 'dialogue_row_id', buildDialogueGroupRows());
const uiText = diff('08_UI_TEXT', 'ui_text_row_id', [
  ...buildBeatTitleRows(),
  ...buildUiTextLabelRows(),
  ...buildUiMapFillRows(),
]);
const churchStories = diff('30_CHURCH_CONTENT', 'content_row_id', buildChurchStoryRows());

let quiz = null;
const bankPath = process.argv[3];
const starterPath = process.argv[4];
if (bankPath && starterPath) {
  const bank = JSON.parse(readFileSync(bankPath, 'utf8')).rows;
  const starter = JSON.parse(readFileSync(starterPath, 'utf8')).rows;
  quiz = diff('31_CHURCH_QUIZ', 'question_row_id', buildQuizBankRows(bank, starter));
}

const report = {
  generatedAt: new Date().toISOString(),
  snapshotSource: snapshotPath,
  dialogue,
  uiText,
  churchStories,
  quiz,
};

const outPath = process.argv[5] ?? 'scripts/content/content-completion-v1-preview.json';
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`Wrote preview to ${outPath}`);
for (const section of [dialogue, uiText, churchStories, quiz].filter(Boolean)) {
  console.log(
    `  ${section.tab}: ${section.created.length} to create, ${section.alreadyLive.length} already live, ${section.duplicatesInBatch.length} in-batch duplicates`,
  );
}
console.log('\nNo writes were performed. This script only builds and diffs rows in memory.');
