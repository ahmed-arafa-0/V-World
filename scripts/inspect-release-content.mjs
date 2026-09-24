import fs from 'node:fs/promises';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  getDayClock,
  isScheduledToday,
  isScheduledDue,
  usable,
} from '../apps/functions/lib/world/common.js';
const source = getProductionGatewayOrNull();
const gateway = source.gateway ?? source;
const clock = await getDayClock(gateway, new Date());
console.log({ clock });
const [songs, content, quiz, messages, users, assets, players] = await Promise.all(
  [
    '20_SONGS',
    '30_CHURCH_CONTENT',
    '31_CHURCH_QUIZ',
    '19_MESSAGES',
    '02_USERS',
    '10_ASSETS',
    '27_PLAYER_MESSAGES',
  ].map((t) => gateway.readTab(t)),
);
const owner =
  users.rows.find((r) => r.raw.role === 'owner' && r.values.enabled !== false)?.raw.user_id ??
  'veoulla';
console.log(
  'songs',
  songs.rows.map((r) =>
    Object.fromEntries(
      [
        'song_id',
        'title',
        'artist',
        'enabled',
        'release_at',
        'available_in_walkman',
        'audio_asset_id',
        'location_id',
      ].map((k) => [k, r.raw[k]]),
    ),
  ),
);
for (const [label, table] of [
  ['content', content],
  ['quiz', quiz],
])
  console.log(label, {
    total: table.rows.length,
    today: table.rows
      .filter((r) => isScheduledToday(r.raw.active_date, clock))
      .map((r) => ({
        id: r.primaryKeyValue,
        type: r.raw.content_type,
        locale: r.raw.locale,
        enabled: r.values.enabled,
        review: r.raw.review_status,
        date: r.raw.active_date,
        text: usable(r.raw.text ?? r.raw.question),
        images: r.raw.image_asset_ids,
      })),
    near: table.rows
      .filter((r) => String(r.raw.active_date).startsWith(clock.today.slice(0, 7)))
      .slice(0, 3)
      .map((r) => ({ id: r.primaryKeyValue, date: r.raw.active_date })),
  });
const mine = messages.rows.filter(
  (r) =>
    r.values.enabled === true &&
    (!usable(r.raw.recipient_user_id) || r.raw.recipient_user_id === owner),
);
console.log('mail', {
  all: messages.rows.length,
  ownerEligible: mine
    .filter((r) => isScheduledDue(r.raw.delivery_at, clock))
    .map((r) => ({
      id: r.raw.message_id,
      locale: r.raw.locale,
      date: r.raw.delivery_at,
      text: usable(r.raw.text),
    })),
  recipients: [...new Set(messages.rows.map((r) => r.raw.recipient_user_id))],
  deliveries: players.rows
    .filter((r) => r.raw.user_id === owner)
    .map((r) => ({ id: r.raw.message_id, status: r.raw.read_status })),
});
console.log(
  'audio assets',
  assets.rows
    .filter((r) => songs.rows.some((s) => s.raw.audio_asset_id === r.primaryKeyValue))
    .map((r) => ({
      id: r.primaryKeyValue,
      enabled: r.values.enabled,
      drive: usable(r.raw.drive_file_id),
      type: r.raw.asset_type,
    })),
);
await fs.mkdir('test-results/release', { recursive: true });
await fs.writeFile(
  'test-results/release/catalog-before.json',
  JSON.stringify(
    {
      songs: songs.rows.map((r) => r.raw),
      content: content.rows.map((r) => r.raw),
      quiz: quiz.rows.map((r) => r.raw),
    },
    null,
    2,
  ),
);
