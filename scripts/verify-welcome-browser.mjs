import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture } from './lib/phase2-fixture.mjs';
import { createApp } from '../apps/functions/lib/app.js';
import { createReviewGateway } from './review-isolation.mjs';
import { createOrReconcileSession } from '../apps/functions/lib/services/session.service.js';
const out = 'test-results/welcome-message',
  beforeMode = process.argv.includes('--before');
const fixture = await startPhase2Fixture({ artPack: true });
const source = JSON.parse(fs.readFileSync(`${out}/before.json`, 'utf8'));
const input = JSON.parse(
  fs.readFileSync('scripts/content/welcome-message-2026-09-22.json', 'utf8'),
);
const userId = 'manual_review_112233445566';
for (const [tab, rows] of Object.entries(source.state))
  for (const original of rows) {
    const raw = Object.fromEntries(
      Object.entries(original).map(([k, v]) => [
        k,
        k === 'user_id' ? userId : v.replaceAll(source.userId, userId),
      ]),
    );
    await fixture.gateway.appendRow(tab, raw);
  }
for (const r of (await fixture.gateway.readTab('19_MESSAGES')).rows)
  await fixture.gateway.updateByPrimaryKey('19_MESSAGES', r.primaryKeyValue, { enabled: 'FALSE' });
const owner = (await fixture.gateway.readTab('02_USERS')).rows.find(
  (r) => r.raw.role === 'owner' && r.values.active === true,
).primaryKeyValue;
for (const r of source.messages) {
  const raw = Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'sheetRow'));
  await fixture.gateway.appendRow('19_MESSAGES', {
    ...raw,
    recipient_user_id: owner,
    text: input.texts[raw.locale],
  });
}
await fixture.gateway.appendRow('19_MESSAGES', {
  message_row_id: 'other_private',
  message_id: 'other_private',
  recipient_user_id: 'other_player',
  delivery_at: '<FIRST_VISIT>',
  enabled: 'TRUE',
  locale: 'en',
  text: 'PRIVATE OTHER PLAYER',
});
const scoped = createReviewGateway(fixture.gateway, userId);
const mapped = await scoped.readTab('19_MESSAGES');
assert.equal(
  mapped.rows.find((r) => r.primaryKeyValue === 'other_private').raw.recipient_user_id,
  'other_player',
);
const sessionId = `sess_gate_welcome_fixture_${Date.now()}`;
await createOrReconcileSession(scoped, {
  sessionId,
  userId,
  ip: '127.0.0.1',
  deviceId: 'welcome-fixture',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3600000),
});
const app = express();
app.use('/api/media', (req, res) => res.redirect(307, fixture.origin + req.originalUrl));
app.use(express.static(path.resolve('apps/web/dist')));
app.use(
  createApp({
    getGateway: () => scoped,
    getDriveClient: () => null,
    getEnvironment: () => 'local',
    isProduction: () => false,
  }),
);
app.get('*', (_req, res) => res.sendFile(path.resolve('apps/web/dist/index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: 'vw_owner_session', value: sessionId, domain: '127.0.0.1', path: '/' },
]);
const page = await context.newPage(),
  network = [];
page.on('response', async (r) => {
  if (/\/api\/world\/(marcelino|mailbox|journey)/.test(r.url()))
    network.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      body: await r.json().catch(() => null),
    });
});
const state = async () =>
  (await fixture.gateway.readTab('27_PLAYER_MESSAGES')).rows
    .filter((r) => r.raw.user_id === userId)
    .map((r) => r.raw);
const journey = async () => await (await context.request.get(`${origin}/api/world/journey`)).json();
try {
  await page.goto(origin);
  await page.getByTestId('marcelino-intro').waitFor();
  await page.getByTestId('marcelino-intro-close').click();
  if (beforeMode) {
    await expect(page.getByTestId('marcelino-intro')).toBeVisible();
    await page.screenshot({
      path: `out-placeholder`.replace('out-placeholder', `${out}/ineffective-close-before.png`),
    });
    console.log('REPRODUCED: Close leaves the first-delivery dialog open; no player mutation.');
  } else {
    await expect(page.getByTestId('marcelino-intro')).toBeHidden();
    await page.waitForTimeout(300);
    assert.deepEqual(await state(), []);
    expect((await journey()).currentBeat.beatId).toBe('beat_12_marcelino');
    await page.getByTestId('cottage-outside-mailbox').click();
    await page.getByTestId('marcelino-deliver').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('marcelino-delivering')).toBeHidden();
    assert.deepEqual(await state(), []);
    await page.getByTestId('cottage-outside-mailbox').click();
    // Keep missing-content behavior honest on this fixture before putting approved content back.
    for (const r of source.messages)
      await fixture.gateway.updateByPrimaryKey('19_MESSAGES', r.message_row_id, { text: r.text });
    const missing = page.waitForResponse((r) =>
      r.url().endsWith('/api/world/marcelino/first-delivery'),
    );
    await page.getByTestId('marcelino-hand-over').click();
    expect((await missing).status()).toBe(409);
    await expect(page.getByTestId('delivery-error')).toBeVisible();
    assert.deepEqual(await state(), []);
    expect((await journey()).currentBeat.beatId).toBe('beat_12_marcelino');
    for (const r of source.messages)
      await fixture.gateway.updateByPrimaryKey('19_MESSAGES', r.message_row_id, {
        text: input.texts[r.locale],
      });
    const delivery = page.waitForResponse((r) =>
      r.url().endsWith('/api/world/marcelino/first-delivery'),
    );
    await page.getByTestId('marcelino-hand-over').click();
    expect((await delivery).status()).toBe(200);
    await page.getByTestId('mailbox-panel').waitFor();
    let saved = await state();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].message_id, input.messageId);
    assert.equal(saved[0].read_status, 'unread');
    expect((await journey()).currentBeat.beatId).toBe('beat_13_message');
    await page.getByTestId('mailbox-panel-close').click();
    assert.equal((await state())[0].read_status, 'unread');
    expect((await journey()).currentBeat.beatId).toBe('beat_13_message');
    await page.getByTestId('cottage-outside-mailbox').click();
    const open = page.waitForResponse((r) => r.url().endsWith('/api/world/mailbox/open'));
    await page.getByTestId('mail-open-msg_welcome_ahmed').click();
    expect((await open).status()).toBe(200);
    await page.getByTestId('message-text').waitFor();
    saved = await state();
    assert.equal(saved[0].read_status, 'archived');
    const initial = saved[0].initial_locale;
    expect((await journey()).currentBeat.beatId).toBe('beat_14_farm');
    for (const locale of ['ar-EG', 'en', 'it', 'el', 'fr']) {
      const button = page.getByTestId(`translate-${locale}`);
      if (await button.isEnabled()) {
        const translated = page.waitForResponse((r) =>
          r.url().endsWith('/api/world/mailbox/translate'),
        );
        await button.click();
        expect((await translated).status()).toBe(200);
      }
      await expect(page.getByTestId('message-text')).toHaveText(input.texts[locale]);
      expect(await page.getByTestId('message-text').textContent()).toBe(input.texts[locale]);
      assert.equal((await state())[0].initial_locale, initial);
      await page.screenshot({ path: `${out}/message-${locale}.png` });
    }
    const final = await journey();
    assert.equal(final.keys.find((k) => k.keyTypeId === 'key_letter').quantity, 1);
    assert.equal(
      (await state()).some((r) => r.message_id === 'other_private'),
      false,
    );
    console.log(
      'PASS Close/Escape/reopen, missing-content 409, approved delivery unread, explicit reading archived and advances, five exact translations/unchanged initial locale, one letter key, unrelated private message excluded.',
    );
  }
} finally {
  fs.writeFileSync(
    `${out}/${beforeMode ? 'before' : 'verified'}-browser-network.json`,
    JSON.stringify(network, null, 2),
  );
  await browser.close();
  server.close();
  fixture.server.close();
}
