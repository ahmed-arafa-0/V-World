#!/usr/bin/env node
/**
 * Read-only inspection of the live birthday_2026 configuration/content. Never writes anything.
 * Prints the current raw row(s) for 17_EVENTS.birthday_2026, 19_MESSAGES (msg_birthday_2026*),
 * 23_ACHIEVEMENTS.birthday_2026_celebrated (+ its icon chain), 10_ASSETS.birthday_cottage_decoration,
 * and which of the 28 birthday_* 08_UI_TEXT ids already exist. Manually invoked only.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';

const sheetsClient = createGoogleSheetsClientOrNull();
if (!sheetsClient) {
  console.error('BLOCKER: no Google Sheets credential available.');
  process.exit(1);
}
const gateway = new SheetGateway(sheetsClient, { ttlSeconds: 0 });

function printRow(label, raw) {
  console.log(`\n--- ${label} ---`);
  if (!raw) {
    console.log('  (not found)');
    return;
  }
  for (const [k, v] of Object.entries(raw)) console.log(`  ${k}: ${JSON.stringify(v)}`);
}

const events = await gateway.readTab('17_EVENTS', { bypass: true });
const eventRow = events.rows.find((r) => r.primaryKeyValue === 'birthday_2026');
printRow('17_EVENTS.birthday_2026', eventRow?.raw);
console.log('  parsed values.target_at:', eventRow?.values.target_at);
console.log('  parsed values.end_at:', eventRow?.values.end_at);
console.log('  parsed values.start_at:', eventRow?.values.start_at);
console.log('  parsed values.enabled:', eventRow?.values.enabled);

const messages = await gateway.readTab('19_MESSAGES', { bypass: true });
const birthdayMsgRows = messages.rows.filter((r) => r.raw.message_id === 'msg_birthday_2026');
console.log(
  `\n--- 19_MESSAGES (message_id=msg_birthday_2026): ${birthdayMsgRows.length} row(s) ---`,
);
for (const r of birthdayMsgRows) {
  console.log(
    `  [${r.primaryKeyValue}] locale=${r.raw.locale} enabled=${r.raw.enabled} recipient=${r.raw.recipient_user_id} textLen=${(r.raw.text ?? '').length}`,
  );
}

const achievements = await gateway.readTab('23_ACHIEVEMENTS', { bypass: true });
const achRow = achievements.rows.find((r) => r.primaryKeyValue === 'birthday_2026_celebrated');
printRow('23_ACHIEVEMENTS.birthday_2026_celebrated', achRow?.raw);

if (achRow?.raw.icon_id) {
  const icons = await gateway.readTab('09_ICONS', { bypass: true });
  const iconRow = icons.rows.find((r) => r.primaryKeyValue === achRow.raw.icon_id);
  printRow(`09_ICONS.${achRow.raw.icon_id}`, iconRow?.raw);
  if (iconRow?.raw.asset_id) {
    const assets = await gateway.readTab('10_ASSETS', { bypass: true });
    const assetRow = assets.rows.find((r) => r.primaryKeyValue === iconRow.raw.asset_id);
    printRow(`10_ASSETS.${iconRow.raw.asset_id}`, assetRow?.raw);
  }
}

const assets = await gateway.readTab('10_ASSETS', { bypass: true });
const decorationRow = assets.rows.find((r) => r.primaryKeyValue === 'birthday_cottage_decoration');
printRow('10_ASSETS.birthday_cottage_decoration', decorationRow?.raw);
for (const id of [
  'birthday_garden',
  'birthday_cake',
  'birthday_candle_unlit',
  'birthday_candle_flame',
]) {
  const row = assets.rows.find((r) => r.primaryKeyValue === id);
  printRow(`10_ASSETS.${id}`, row?.raw);
}

const NEEDED_TEXT_IDS = [
  'birthday_celebrate_now',
  'birthday_complete',
  'birthday_continue',
  'birthday_entry_label',
  'birthday_entry_replay_label',
  'birthday_extinguish_candle',
  'birthday_gift_achievement_label',
  'birthday_gift_claim',
  'birthday_gift_claimed',
  'birthday_gift_decoration_label',
  'birthday_gift_decoration_placed_hint',
  'birthday_gift_letter_label',
  'birthday_gifts_intro',
  'birthday_greeting',
  'birthday_invite',
  'birthday_later',
  'birthday_letter_pending',
  'birthday_letter_title',
  'birthday_menu_intro',
  'birthday_replay_badge',
  'birthday_replay_celebration',
  'birthday_replay_celebration_cta',
  'birthday_replay_countdown',
  'birthday_replay_countdown_cta',
  'birthday_seconds_label',
  'birthday_skip',
  'birthday_wish_placeholder',
  'birthday_wish_prompt',
  'birthday_wish_save',
  'birthday_wish_saved',
];
const uiText = await gateway.readTab('08_UI_TEXT', { bypass: true });
console.log(`\n--- 08_UI_TEXT coverage for ${NEEDED_TEXT_IDS.length} birthday text_ids ---`);
for (const id of NEEDED_TEXT_IDS) {
  const rows = uiText.rows.filter((r) => r.raw.text_id === id);
  const locales = rows
    .map((r) => r.raw.locale)
    .sort()
    .join(',');
  console.log(`  ${id}: ${rows.length} row(s) [${locales}]`);
}

const langs = await gateway.readTab('07_LANGUAGES', { bypass: true });
console.log('\n--- 07_LANGUAGES ---');
for (const r of langs.rows)
  console.log(`  ${r.primaryKeyValue}: enabled=${r.raw.enabled} direction=${r.raw.direction}`);
