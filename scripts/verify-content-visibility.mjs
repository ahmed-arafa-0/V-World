#!/usr/bin/env node
/**
 * Bounded, mostly read-only content-visibility check against the real production Sheet plus a
 * couple of live API calls through the isolated review server (port 5051), as the isolated review
 * player. Never writes. Checks:
 *  - dialogue/UI-text rows enabled and resolving,
 *  - today's scheduled story/verse/quiz resolve via the actual church API (authoritative clock),
 *  - quiz row count vs unique question count (reported separately, per instruction),
 *  - the Birthday Verse (2026-09-26) row is untouched,
 *  - message recipient isolation for the isolated player.
 * Manually invoked: node scripts/verify-content-visibility.mjs <sessionId>
 */
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { getAuthoritativeTimeZone, calendarDateKey } from '../apps/functions/lib/services/authoritative-time.service.js';

const SESSION_ID = process.argv[2];
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:5051';

const gateway = getProductionGatewayOrNull();
if (!gateway) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}

console.log('=== Dialogue / UI text ===');
const dialogue = await gateway.readTab('15_DIALOGUE');
const dialogueEnabled = dialogue.rows.filter((r) => r.raw.enabled === true || r.raw.enabled === 'TRUE');
console.log(`15_DIALOGUE: ${dialogue.rows.length} rows total, ${dialogueEnabled.length} enabled.`);
const uiText = await gateway.readTab('08_UI_TEXT');
const uiTextEnabled = uiText.rows.filter((r) => r.raw.enabled === true || r.raw.enabled === 'TRUE');
console.log(`08_UI_TEXT: ${uiText.rows.length} rows total, ${uiTextEnabled.length} enabled.`);
// Spot-check a handful of known keys actually resolve for English.
const sampleKeys = ['church_candle_corner', 'walkman_seek', 'ocean_look', 'try_again'];
for (const key of sampleKeys) {
  const row = uiText.rows.find((r) => r.raw.text_id === key && r.raw.locale === 'en');
  console.log(`  ${key} (en): ${row ? `"${row.raw.text}" (enabled=${row.raw.enabled})` : 'MISSING'}`);
}
const dialogueByGroup = new Map();
for (const r of dialogue.rows) {
  const g = r.raw.group_id;
  const s = dialogueByGroup.get(g) ?? { TRUE: 0, FALSE: 0 };
  s[String(r.raw.enabled)] = (s[String(r.raw.enabled)] ?? 0) + 1;
  dialogueByGroup.set(g, s);
}
console.log('  Dialogue groups, enabled vs disabled row counts:');
for (const [group, counts] of dialogueByGroup) {
  console.log(`    ${group}: enabled=${counts.TRUE ?? 0} disabled=${counts.FALSE ?? 0}`);
}

console.log('\n=== Authoritative clock ===');
const tz = await getAuthoritativeTimeZone(gateway);
const today = calendarDateKey(new Date(), tz);
console.log(`Authoritative timezone: ${tz}, today: ${today}`);

console.log('\n=== Quiz: row count vs unique question count ===');
const quiz = await gateway.readTab('31_CHURCH_QUIZ');
const uniqueQuestionIds = new Set(quiz.rows.map((r) => r.raw.question_id).filter(Boolean));
console.log(`31_CHURCH_QUIZ: ${quiz.rows.length} rows total; ${uniqueQuestionIds.size} unique question_id values.`);
console.log(
  `(${quiz.rows.length} rows covers ${uniqueQuestionIds.size} distinct questions across their locale/translation rows.)`,
);
const scheduledToday = quiz.rows.filter((r) => r.raw.active_date === today);
console.log(`Quiz rows scheduled for today (${today}): ${scheduledToday.length}`);

console.log('\n=== Birthday content (2026-09-26) ===');
const church = await gateway.readTab('30_CHURCH_CONTENT');
const birthdayVerse = church.rows.find((r) => r.raw.content_id === 'church_verse_001');
if (birthdayVerse) {
  console.log(
    `church_verse_001: title="${birthdayVerse.raw.title}" active_date=${birthdayVerse.raw.active_date} enabled=${birthdayVerse.raw.enabled}`,
  );
} else {
  console.log('church_verse_001: NOT FOUND');
}
const welcomeMsg = (await gateway.readTab('19_MESSAGES')).rows.filter(
  (r) => r.raw.message_id === 'msg_welcome_ahmed',
);
console.log(`msg_welcome_ahmed rows: ${welcomeMsg.length}`);

if (SESSION_ID) {
  console.log('\n=== Live API — today\'s scheduled content via the actual Church endpoint ===');
  for (const locale of ['en', 'ar-EG']) {
    const res = await fetch(`${ORIGIN}/api/world/church?locale=${locale}`, {
      headers: { Cookie: `vw_owner_session=${SESSION_ID}` },
    });
    const body = await res.json();
    console.log(
      `  locale=${locale}: status=${res.status} verse=${body.verse ? 'present' : 'none'} story=${body.story ? 'present' : 'none'} quizQuestions=${body.quiz?.questions?.length ?? 'n/a'}`,
    );
    if (body.story?.imageRefs) {
      console.log(`    story.imageRefs: ${JSON.stringify(body.story.imageRefs)}`);
    }
  }

}

console.log('\n=== Message recipient isolation (direct read, no live journey) ===');
const messages = await gateway.readTab('19_MESSAGES');
const owners = (await gateway.readTab('02_USERS')).rows.filter(
  (r) => r.raw.role === 'owner' && r.raw.active === true,
);
const ownerId = owners[0]?.primaryKeyValue;
const forOwner = messages.rows.filter((r) => r.raw.recipient_user_id === ownerId).length;
const forReviewPlayer = messages.rows.filter(
  (r) => r.raw.recipient_user_id === 'manual_review_1790065059494',
).length;
console.log(
  `19_MESSAGES: ${messages.rows.length} total rows; ${forOwner} addressed to the real owner; ${forReviewPlayer} addressed to the isolated review player (expect 0 — recipient isolation holds if so).`,
);
