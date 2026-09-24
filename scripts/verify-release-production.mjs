/** Read-only production smoke checks; never performs owner gameplay or reveals secrets. */
import assert from 'node:assert/strict';
const origin = process.env.RELEASE_ORIGIN ?? 'http://127.0.0.1:5085';
for (const route of ['/', '/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png']) {
  const response = await fetch(origin + route);
  assert.equal(response.status, 200, route);
  if (route.endsWith('.png')) assert.match(response.headers.get('content-type'), /^image\/png/);
}
const health = await (await fetch(origin + '/api/health')).json();
assert.equal(health.environment, 'production');
assert.equal(health.sheets.reachable, true);
for (const route of ['/api/dev/birthday-test-clock', '/api/dev/map-preview-assets'])
  assert.equal((await fetch(origin + route)).status, 404, route);
assert.equal((await fetch(origin + '/api/world/church')).status, 401);
assert.equal((await fetch(origin + '/api/media/birthday_cake')).status, 401);
const session = await fetch(origin + '/api/session/owner');
assert.equal(session.status, 401);
console.log(
  'PASS production startup after npm prune: health + Sheets, public icons, normal auth required, private media protected, development routes absent.',
);
