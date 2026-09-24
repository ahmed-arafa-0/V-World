import fs from 'node:fs';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
const gateway = getProductionGatewayOrNull();
const userId = 'manual_review_1790065059494';
const messages = (await gateway.readTab('19_MESSAGES', { bypass: true, strict: true })).rows
  .filter((r) => r.raw.message_id === 'msg_welcome_ahmed')
  .map((r) => ({ sheetRow: r.rowIndex + 1, ...r.raw }));
const snapshot = { userId, at: new Date().toISOString(), messages, state: {} };
for (const tab of [
  '24_PLAYER_PROGRESS',
  '25_PLAYER_KEYS',
  '26_PLAYER_ACHIEV',
  '27_PLAYER_MESSAGES',
  '37_CHARACTER_STATE',
])
  snapshot.state[tab] = (await gateway.readTab(tab)).rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => r.raw);
fs.writeFileSync('test-results/welcome-message/before.json', JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(messages, null, 2));
console.log(
  JSON.stringify({
    userId,
    progress: snapshot.state['24_PLAYER_PROGRESS'].map((r) => ({
      route: r.story_route_id,
      beat: r.current_beat_id,
      checkpoint: r.last_checkpoint_id,
    })),
    messages: snapshot.state['27_PLAYER_MESSAGES'].length,
  }),
);
