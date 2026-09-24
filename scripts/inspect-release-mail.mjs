import fs from 'node:fs/promises';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { createReviewGateway } from './review-isolation.mjs';
import { KeyMutex } from '../apps/functions/lib/repositories/key-mutex.js';
import { getCottageState } from '../apps/functions/lib/world/cottage.js';
const source = getProductionGatewayOrNull();
const { userId } = JSON.parse(
  await fs.readFile('test-results/review-repair/fresh-review.json', 'utf8'),
);
const sessions = await source.readTab('06_SESSIONS');
const session = sessions.rows
  .filter((r) => r.raw.user_id === userId && Date.parse(r.values.expires_at) > Date.now())
  .at(-1);
const current = await fetch('http://localhost:5051/api/world/cottage', {
  headers: { Cookie: `vw_owner_session=${session.primaryKeyValue}` },
});
const live = await current.json();
console.log('Running ordinary mailbox', {
  status: current.status,
  messages: live.messages?.map((m) => ({ id: m.messageId, status: m.readStatus })),
});
const gateway = createReviewGateway(source, userId);
const state = await getCottageState({ gateway, userId, now: new Date(), mutex: new KeyMutex() });
console.log('Current adapter mailbox', {
  messages: state.messages.map((m) => ({ id: m.messageId, status: m.readStatus })),
});
const rows = await source.readTab('27_PLAYER_MESSAGES');
console.log(
  'Persisted review deliveries',
  rows.rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => ({ id: r.raw.message_id, status: r.raw.read_status })),
);
