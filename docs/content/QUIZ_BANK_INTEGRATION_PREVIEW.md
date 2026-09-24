# Veoulla Quiz Bank — Integration Plan & Exact Import Preview

**Date:** 2026-09-22
**Source package:** `assets/Veoulla_Quiz_Bank/` (`README_CODEX.md`, `VALIDATION.json`, `quiz_all_316_ar.json` / `quiz_new_300_ar.json` + `quiz_previous_16_ar.json`, `quiz_all_316_ar.csv`, `Veoulla_Quiz_316.xlsx`, `REVIEW.html`).
**Nature of this document:** a dry-run mapping and preview only. **No import was run, no Sheet row was written, no ID was assigned as final, and no reward/difficulty/scheduling decision was made.** Everything below is either (a) already true of the running code, verified by reading it, or (b) a concrete, open decision named for Ahmed — never guessed.

## 1. What the package is (per its own `README_CODEX.md`)

- 316 Arabic (`ar-EG`) Bible-knowledge questions: 300 new + 16 previously-existing, kept as a separate labeled batch.
- Every question's `status` is `draft_for_review` — Ahmed has not approved the wording yet; importing the _rows_ is not the same as _activating_ them, and this document does neither.
- The package explicitly disclaims seeding: "this is a content package, not a ready seed for the current Sheet schema... no assumption was made about the Sheet's column shapes or the current true/false contract." The instructions below are exactly the "read the project's real contracts and schema, then map fields" step the package asks for.
- Per its own instructions: preserve existing content, don't invent IDs, use an idempotent import with a stable ID per question and a preview report before any write, and don't change reward rules, per-round question counts, or game difficulty automatically. This document follows all of that.

## 2. Does the current build support both question types? — Yes, already, end to end

Verified by reading the code (not assumed):

| Layer           | Evidence                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema          | `31_CHURCH_QUIZ.question_type` column, no controlled list restricting it (`packages/sheet-schema/src/tabs/content-systems.ts:191`)                                                                                                                              |
| Backend         | `buildQuestion()` branches on `question_type === 'true_false'` vs. multiple choice, builds `{id:'true',text:''}/{id:'false',text:''}` options for true/false and `option_a..d` for multiple choice (`apps/functions/src/world/church.ts:141-154`)               |
| Answer checking | `normalizeAnswer()` lowercases and maps `t`→`true`, `f`→`false` before comparing server-side; the correct answer is never sent to the browser before an attempt (`church.ts:167-172`, `522-544`)                                                                |
| Contract        | `ChurchQuizQuestionView.questionType: 'multiple_choice' \| 'true_false'` (`packages/contracts/src/world.ts:112-120`)                                                                                                                                            |
| Frontend        | `QuizPanel` in `apps/web/src/features/world/views/ChurchView.tsx:706-781` renders both variants; true/false options are labeled via the already-localized `church_true`/`church_false` UI text (5 languages, `packages/contracts/src/world-ui-text.ts:492-493`) |
| Rewards         | Completing a day's quiz (all questions active that day, answered correctly) awards each row's `key_reward_type_id` once per day and evaluates `trigger_type=quiz` achievements (`church.ts:477-609`) — no code change needed for either question type           |

**Conclusion: no build work is required to support multiple-choice and true/false quiz questions.** The only remaining work is data — importing rows — and the open decisions in §5 below.

## 3. Existing content check (README_CODEX §2: "compare the previous 16 against what's already there")

Live `31_CHURCH_QUIZ` (read 2026-09-22, bounded batched read, `bypass:true`) contains **exactly 2 rows**:

| `question_row_id` | `question_id` | `locale` | `enabled` | `review_status` | Content                                                                                                      |
| ----------------- | ------------- | -------- | --------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `quiz_001_en`     | `quiz_001`    | en       | FALSE     | pending_review  | Every text cell is a literal placeholder: `<REVIEWED QUESTION>`, `<A>`…`<D>`, `<EXPLANATION>`, `<REFERENCE>` |
| `quiz_001_ar`     | `quiz_001`    | ar-EG    | FALSE     | pending_review  | Same, Arabic placeholder tokens                                                                              |

This is a schema-shape template row, not real content. **There is no real production quiz question live to preserve, and no ID overlap with anything the package proposes** (`quiz_001` vs. the package's `vw_bible_previous_mc_001` … `vw_bible_previous_mc_016` / `vw_bible_{easy,medium,hard}_{mc,tf}_0xx`). Per the package's own §2, its IDs are _proposed_, not a claim about production IDs — this check confirms there is nothing in production for them to collide with.

## 4. Field-by-field mapping (package → `31_CHURCH_QUIZ` columns)

| Sheet column           | Multiple choice                                                                                                                                                    | True/false                                                                                                                                                                              | Notes                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `question_row_id` (PK) | `<package id>_ar` (mirrors the live template's own `<question_id>_<short-locale>` convention, e.g. `vw_bible_previous_mc_001_ar`)                                  | same                                                                                                                                                                                    | Stable and idempotent: re-running the import with the same package produces the same row ID.                            |
| `question_id`          | package `id` unchanged (e.g. `vw_bible_previous_mc_001`)                                                                                                           | same                                                                                                                                                                                    | Groups locale rows per the tab's own documented convention.                                                             |
| `active_date`          | **no source field — see §5.1**                                                                                                                                     | same                                                                                                                                                                                    | The package has no dates; the tab requires one per row for it to ever appear.                                           |
| `locale`               | `ar-EG`                                                                                                                                                            | same                                                                                                                                                                                    | Matches `39_VALIDATION_LISTS.locale`.                                                                                   |
| `question`             | `question`                                                                                                                                                         | `question`                                                                                                                                                                              | Direct copy.                                                                                                            |
| `question_type`        | `multiple_choice`                                                                                                                                                  | `true_false`                                                                                                                                                                            | Direct copy of the package's own `type` field — already the exact two values the schema/backend expect.                 |
| `option_a`..`option_d` | `options[].text` by `id` (A→a, B→b, C→c, D→d)                                                                                                                      | left blank                                                                                                                                                                              | `buildQuestion()` ignores `option_a`-`d` entirely for `true_false` (`church.ts:143-148`), so nothing needs to go there. |
| `correct_answer`       | package `correct_answer` (`"A"`–`"D"`), case-insensitive since `normalizeAnswer()` lowercases both sides before comparing                                          | package boolean `true`/`false` written as the literal text `"true"`/`"false"` (**never JS truthiness on the string `"false"`** — the package's own README §6 warns of exactly this bug) | Confirmed compatible with `normalizeAnswer()` without any code change.                                                  |
| `explanation`          | package `explanation` is `null` for all 166 multiple-choice questions → leave blank (the schema/UI already treat blank as "no explanation shown", `church.ts:616`) | package `explanation` is present for all 150 true/false questions → direct copy                                                                                                         | Matches the package's own design (§10 of its README).                                                                   |
| `bible_reference`      | see §5.3 — the schema has one text column, the package has an array                                                                                                | same                                                                                                                                                                                    |                                                                                                                         |
| `achievement_id`       | see §5.4                                                                                                                                                           | same                                                                                                                                                                                    |                                                                                                                         |
| `key_reward_type_id`   | see §5.4                                                                                                                                                           | same                                                                                                                                                                                    |                                                                                                                         |
| `enabled`              | **FALSE until Ahmed approves and activates** (see §5.5)                                                                                                            | same                                                                                                                                                                                    |                                                                                                                         |
| `review_status`        | see §5.2                                                                                                                                                           | same                                                                                                                                                                                    |                                                                                                                         |

Columns the package explicitly does **not** map to anything, by its own design (§11 of its README): `story_id`, `image_asset_id` — and in fact **`31_CHURCH_QUIZ` has no such columns at all**, so there is nothing to leave blank; the package's note simply doesn't apply to this destination table.

## 5. Open decisions — named, not guessed

These block a real import; none are invented below.

### 5.1 Scheduling model (blocking)

`31_CHURCH_QUIZ` is a **daily** quiz: `questionRowsFor()` only surfaces rows whose `active_date` equals the server's "today," computed per the day clock (`church.ts:114-122`, `common.ts:84-87`), and a day's quiz is "complete" once every question active that day is answered correctly (`church.ts:555-579`). There is no random-draw-from-a-pool mechanic and no `difficulty` column in the schema. The package is a flat, dateless 316-question pool tagged `easy`/`medium`/`hard`/`batch`.

**Needed from Ahmed:** how should 316 dateless questions become dated rows? Options include (not a recommendation, just naming the shape of the decision): a fixed daily rotation starting from some date, N questions per day with a difficulty mix, or a schema/mechanic change to support pool-based random daily draws instead of exact-date rows. Until this is decided, importing questions with no `active_date` (or with dates chosen arbitrarily) is not something this document will do.

### 5.2 `review_status` value (blocking)

Package status: `draft_for_review` (all 316 questions). Live `39_VALIDATION_LISTS.review_status` controlled list is exactly `draft`, `pending_review`, `approved`, `rejected` — **`draft_for_review` is not a member of it.**

**Needed from Ahmed:** does `draft_for_review` mean `draft` or `pending_review` here? (The live template row currently uses `pending_review`.)

### 5.3 Multi-reference questions vs. single `bible_reference` column (needs a format decision)

`31_CHURCH_QUIZ.bible_reference` is one text column; the package's `references` is an array (usually 1 entry, but **11 of 316 questions have 2–5 references**, e.g. `vw_bible_easy_tf_012` cites Exodus 7, 8, 9, 10, and 12 across five separate ranges for a "only three plagues" true/false question). The package's own §9 says to "keep all references if a question has more than one" — but the schema gives no array field to keep them _in_.

**Needed from Ahmed:** an agreed concatenation format for the `bible_reference` cell when a question has more than one reference (e.g. `"; "`-joined `label_ar` values), since the schema itself doesn't support multiple references per row today.

### 5.4 Reward/achievement linkage per question (blocking, by the package's own design)

The package intentionally leaves no reward information (§11: "don't assume reward rules"). But `achievement_id` and `key_reward_type_id` are real, required-shaped columns on every `31_CHURCH_QUIZ` row, and the one live template row uses `achievement_id=ach_perfect_quiz`, `key_reward_type_id=key_candle` (matching the already-configured `ach_perfect_quiz` achievement in `23_ACHIEVEMENTS`, which needs a 100%-correct day).

**Needed from Ahmed:** should every imported row reuse `ach_perfect_quiz` / `key_candle` (i.e., the whole 316-question bank feeds the same single daily quiz reward), or does the reward/achievement vary by batch or difficulty? This document does not assume either answer.

### 5.5 Draft content must not go live by accident

Per the package's own §4: "the new questions are `draft_for_review`... approving the batch and activating it in the game is a separate action." Any import must set `enabled=FALSE` for every imported row (mirroring the current template row) regardless of the `review_status` chosen in §5.2, until Ahmed explicitly approves and enables specific rows/dates. This is a hard constraint on the import, not a preference.

### 5.6 Locale scope

The package is Arabic-only, consistent with its own §12 ("don't treat as a stand-in for English/Italian/Greek/French translations"). `31_CHURCH_QUIZ` already supports one row per locale per `question_id` (the tab's own documented shape). Because `pickLocaleRow()` falls back to English when a player's locale has no row and returns nothing if English is also absent (`common.ts:90-97`, `church.ts:139`), **importing Arabic-only rows means non-Arabic-locale players simply never see these questions** (not an error — `buildQuestion()` returns `null` and the question is omitted from that day's list) until English/Italian/Greek/French text exists.

**Needed from Ahmed:** is it acceptable for the quiz bank to appear Arabic-only in the interim (silently absent for other locales), or should activation wait for translations?

## 6. Exact import preview (dry run — nothing written)

Below is exactly what rows would be written **once §5.1–§5.4 are decided** — shown here so Ahmed can review the shape before anything is committed to the Sheet. All 316 rows would follow this pattern; three representative rows are shown (one previous-16 multiple-choice, one new-300 true/false, one new-300 multi-reference true/false), using the placeholders `<DATE>` / `<STATUS>` / `<ACH_ID>` / `<KEY_ID>` for the values §5.1/§5.2/§5.4 have not yet fixed:

| question_row_id               | question_id                | active_date | locale | question                                       | question_type   | option_a  | option_b  | option_c  | option_d  | correct_answer | explanation                              | bible_reference                                                                                                            | achievement_id | key_reward_type_id | enabled | review_status |
| ----------------------------- | -------------------------- | ----------- | ------ | ---------------------------------------------- | --------------- | --------- | --------- | --------- | --------- | -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ | ------- | ------------- |
| `vw_bible_previous_mc_001_ar` | `vw_bible_previous_mc_001` | `<DATE>`    | ar-EG  | مين الملاك اللي بشّر العذراء مريم بميلاد يسوع؟ | multiple_choice | رافائيل   | جبرائيل   | ميخائيل   | سوريال    | b              | _(blank)_                                | لوقا 1:26-31                                                                                                               | `<ACH_ID>`     | `<KEY_ID>`         | FALSE   | `<STATUS>`    |
| `vw_bible_easy_tf_045_ar`     | `vw_bible_easy_tf_045`     | `<DATE>`    | ar-EG  | الجنود اقتسموا ثياب يسوع عند الصلب.            | true_false      | _(blank)_ | _(blank)_ | _(blank)_ | _(blank)_ | true           | اقتسموا ثيابه وألقوا قرعة على القميص.    | يوحنا 19:23-24                                                                                                             | `<ACH_ID>`     | `<KEY_ID>`         | FALSE   | `<STATUS>`    |
| `vw_bible_easy_tf_012_ar`     | `vw_bible_easy_tf_012`     | `<DATE>`    | ar-EG  | كل ضربات مصر كانت ثلاث ضربات فقط.              | true_false      | _(blank)_ | _(blank)_ | _(blank)_ | _(blank)_ | false          | يسجل السفر عشر ضربات تنتهي بموت الأبكار. | _(needs §5.3's join format — 5 references: الخروج 7:14-25; الخروج 8:1-32; الخروج 9:1-35; الخروج 10:1-29; الخروج 12:29-30)_ | `<ACH_ID>`     | `<KEY_ID>`         | FALSE   | `<STATUS>`    |

### Exact counts (verified against the package's own `VALIDATION.json` and by direct inspection of `quiz_all_316_ar.json`)

- 316 unique question IDs, 316 unique question texts — no duplicates.
- 166 `multiple_choice` + 150 `true_false` = 316.
- 300 `new_300` batch (100 easy / 100 medium / 100 hard, 50/50 MC↔TF per difficulty) + 16 `previous_16` batch (all multiple choice: 8 easy, 8 medium, per the package's own README note).
- 11 of 316 questions carry more than one Bible reference (2–5 each) — needs §5.3.
- Every multiple-choice `explanation` is `null` (166/166); every true/false `explanation` is populated (150/150) — matches the package's documented design exactly.
- `story_id`/`image_asset_id` are `null` on all 316 — matches the package's documented design; not applicable to `31_CHURCH_QUIZ` regardless, since that table has no such columns.
- All 316 rows have `status: "draft_for_review"` — see §5.2.

## 7. What this document does not do

- Does not write anything to the Sheet.
- Does not assign a final `active_date`, `review_status`, `achievement_id`, or `key_reward_type_id` to any question.
- Does not change `22_KEY_RULES`, reward quantities, or any achievement's trigger rule.
- Does not enable any row.
- Does not translate any question out of Arabic.
- Does not approve the wording of any question — that remains Ahmed's review, per the package's own `draft_for_review` status.
