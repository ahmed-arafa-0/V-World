import fs from 'node:fs';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
const userId = 'manual_review_1790065059494';
const gateway = getProductionGatewayOrNull();
const snapshot = { userId, at: new Date().toISOString(), tables: {} };
for (const tab of [
  '37_CHARACTER_STATE',
  '24_PLAYER_PROGRESS',
  '25_PLAYER_KEYS',
  '26_PLAYER_ACHIEV',
]) {
  snapshot.tables[tab] = (await gateway.readTab(tab)).rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => r.raw);
}
fs.writeFileSync(
  'test-results/candle-review-repair/before-state.json',
  JSON.stringify(snapshot, null, 2),
);
const sessions = (await gateway.readTab('06_SESSIONS')).rows.filter(
  (r) => r.raw.user_id === userId,
);
console.log(
  JSON.stringify(
    {
      userId,
      sessions: sessions.map((r) => ({
        status: r.raw.status,
        expires: r.raw.expires_at,
        location: r.raw.current_location,
      })),
      docs: snapshot.tables['37_CHARACTER_STATE'].map((r) => ({
        system: r.character_id,
        doc: JSON.parse(r.story_flags_json || '{}'),
      })),
      keys: snapshot.tables['25_PLAYER_KEYS'],
    },
    null,
    2,
  ),
);
