import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { createReviewGateway } from './review-isolation.mjs';
const userId = 'manual_review_1790065059494';
const gateway = getProductionGatewayOrNull(),
  review = createReviewGateway(gateway, userId);
const input = JSON.parse(
  fs.readFileSync('scripts/content/welcome-message-2026-09-22.json', 'utf8'),
);
const original = await gateway.readTab('19_MESSAGES'),
  mapped = await review.readTab('19_MESSAGES');
const welcome = mapped.rows.filter((r) => r.raw.message_id === input.messageId);
assert.equal(welcome.length, 5);
for (const r of welcome) {
  assert.equal(r.raw.recipient_user_id, userId);
  assert.equal(r.raw.text, input.texts[r.raw.locale]);
}
for (const row of original.rows) {
  const expected = row.raw.recipient_user_id === 'veoulla' ? userId : row.raw.recipient_user_id;
  assert.equal(
    mapped.rows.find((r) => r.primaryKeyValue === row.primaryKeyValue).raw.recipient_user_id,
    expected,
  );
}
const before = JSON.parse(fs.readFileSync('test-results/welcome-message/before.json', 'utf8'));
const after = {};
for (const tab of Object.keys(before.state))
  after[tab] = (await gateway.readTab(tab, { bypass: true, strict: true })).rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => r.raw);
const same = JSON.stringify(before.state) === JSON.stringify(after);
fs.writeFileSync(
  'test-results/welcome-message/review-state-after.json',
  JSON.stringify(after, null, 2),
);
const result = {
  userId,
  welcomeLocales: welcome.map((r) => r.raw.locale),
  recipientMappingVerified: true,
  unrelatedRecipientsUnchanged: true,
  reviewGameplayUnchanged: same,
  progress: after['24_PLAYER_PROGRESS'].map((r) => ({
    route: r.story_route_id,
    beat: r.current_beat_id,
    checkpoint: r.last_checkpoint_id,
  })),
  deliveredMessages: after['27_PLAYER_MESSAGES'].length,
};
fs.writeFileSync(
  'test-results/welcome-message/live-readonly-verification.json',
  JSON.stringify(result, null, 2),
);
if (!same)
  console.log(
    'NOTICE: Review state changed through external player activity; no restoration attempted.',
  );
console.log(JSON.stringify(result, null, 2));
