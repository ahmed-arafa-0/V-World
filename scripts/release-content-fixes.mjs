/** Narrow, reviewable release catalog corrections. Drive discovery is read-only. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { createGoogleDriveClientOrNull } from '../apps/functions/lib/google/drive-client-factory.js';
import { getDriveRootFolderId } from '../apps/functions/lib/services/media-asset.service.js';
import { createReviewGateway } from './review-isolation.mjs';
const gateway = getProductionGatewayOrNull();
const drive = createGoogleDriveClientOrNull();
const root = await getDriveRootFolderId(gateway);
const queue = [root],
  files = [];
while (queue.length) {
  const children = await drive.listFilesInFolder(queue.shift());
  for (const file of children) {
    if (file.mimeType === 'application/vnd.google-apps.folder') queue.push(file.id);
    else if (/henry|moodie|you were there/i.test(file.name)) files.push(file);
  }
}
console.log(
  'Henry supplied files',
  files.map((f) => ({ name: f.name, mime: f.mimeType, bytes: f.size })),
);
const users = await gateway.readTab('02_USERS');
console.log(
  'owner mapping',
  users.rows
    .filter((r) => r.raw.role === 'owner')
    .map((r) => ({ active: r.values.active, fields: Object.keys(r.raw) })),
);
const manifest = JSON.parse(
  await fs.readFile('test-results/review-repair/fresh-review.json', 'utf8'),
);
const scoped = createReviewGateway(gateway, manifest.userId);
const mapped = await scoped.readTab('19_MESSAGES');
console.log(
  'ordinary mapped rows',
  mapped.rows.filter((r) => r.raw.recipient_user_id === manifest.userId).length,
);
if (!process.argv.includes('--apply')) process.exit(0);
assert.equal(files.length, 1, 'One exact supplied Henry file is required');
const file = files[0];
assert.match(file.mimeType, /^audio\//);
const assets = await gateway.readTab('10_ASSETS', { bypass: true });
const songs = await gateway.readTab('20_SONGS', { bypass: true });
const asset = assets.rows.find((r) => r.raw.drive_file_id === file.id);
const song = songs.rows.find((r) => /henry|you were there/i.test(r.raw.artist + ' ' + r.raw.title));
const assetId = asset?.primaryKeyValue ?? 'asset_audio_song_henry_moodie_001';
assert.ok(!assets.rows.some((r) => r.primaryKeyValue === assetId && !asset), 'Asset id collision');
const songId = song?.primaryKeyValue ?? 'song_henry_moodie_001';
assert.ok(!songs.rows.some((r) => r.primaryKeyValue === songId && !song), 'Song id collision');
const ui = await gateway.readTab('08_UI_TEXT');
const labels = [
  'Put out the candles',
  'اطفي الشمع',
  'Spegni le candele',
  'Σβήσε τα κεριά',
  'Éteins les bougies',
];
const locales = ['en', 'ar-EG', 'it', 'el', 'fr'];
await fs.mkdir('test-results/release', { recursive: true });
await fs.writeFile(
  `test-results/release/catalog-patch-before-${Date.now()}.json`,
  JSON.stringify(
    {
      asset: asset?.raw ?? null,
      song: song?.raw ?? null,
      tul8te: songs.rows.find((r) => r.primaryKeyValue === 'song_tul8te_001')?.raw,
      labels: ui.rows
        .filter((r) => r.raw.text_id === 'world_birthday_extinguish_candle')
        .map((r) => r.raw),
    },
    null,
    2,
  ),
);
const assetPatch = {
  asset_type: 'audio',
  location_id: 'cafe',
  drive_file_id: file.id,
  enabled: 'TRUE',
};
if (asset) await gateway.updateByPrimaryKey('10_ASSETS', assetId, assetPatch);
else
  await gateway.appendIfAbsent('10_ASSETS', assetId, () => ({
    asset_id: assetId,
    ...assetPatch,
    preload_priority: '3',
    loop: 'FALSE',
    version: '1',
    notes: 'Supplied Henry Moodie song, registered after verified Drive discovery.',
  }));
const songPatch = {
  title: 'you were there for me',
  artist: 'Henry Moodie',
  release_at: '',
  location_id: 'cafe',
  audio_asset_id: assetId,
  available_in_walkman: 'TRUE',
  enabled: 'TRUE',
};
if (song) await gateway.updateByPrimaryKey('20_SONGS', songId, songPatch);
else await gateway.appendIfAbsent('20_SONGS', songId, () => ({ song_id: songId, ...songPatch }));
await gateway.updateByPrimaryKey('20_SONGS', 'song_tul8te_001', { artist: 'TUL8TE' });
for (const row of ui.rows.filter((r) => r.raw.text_id === 'world_birthday_extinguish_candle')) {
  const i = locales.indexOf(row.raw.locale);
  if (i >= 0)
    await gateway.updateByPrimaryKey('08_UI_TEXT', row.primaryKeyValue, { text: labels[i] });
}
const checked = await gateway.readTab('20_SONGS', { bypass: true, strict: true });
assert.equal(checked.rows.filter((r) => r.primaryKeyValue === songId).length, 1);
assert.equal(checked.rows.find((r) => r.primaryKeyValue === songId).raw.audio_asset_id, assetId);
const checkedAsset = await gateway.findByPrimaryKey('10_ASSETS', assetId, {
  bypass: true,
  strict: true,
});
assert.equal(checkedAsset.row.raw.drive_file_id, file.id);
console.log(
  'Verified: both catalog songs enabled with supplied audio; plural candle labels updated.',
);
