import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { createReviewGateway, REVIEW_STATE_TABS } from './review-isolation.mjs';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
} from './review-support/birthday-review.mjs';
const source = getProductionGatewayOrNull();
const final = JSON.parse(fs.readFileSync('test-results/review-repair/fresh-review.json', 'utf8'));
const owner = (await source.readTab('02_USERS')).rows.find(
  (r) => r.raw.role === 'owner' && r.values.active === true,
);
const code = owner.raw.gate_code_plaintext; // Used only in memory, never logged or saved.
const browser = await chromium.launch();
const results = [];
try {
  for (const kind of ['ordinary', 'birthday']) {
    const userId =
      kind === 'ordinary'
        ? `manual_review_${Date.now()}`
        : `manual_review_bday_onboarding_${Date.now()}`;
    let server, origin;
    if (kind === 'birthday') {
      const prepared = await prepareBirthdayReviewer({ userId, manifestPath: null, seed: false });
      ({ server, origin } = await startBirthdayServer({ ...prepared, port: 0 }));
      await setBirthdayScenario(origin, prepared.manifest, 'live');
    } else {
      const gateway = createReviewGateway(source, userId);
      server = http.createServer(
        createApp({
          getGateway: () => gateway,
          getEnvironment: () => 'local',
          isProduction: () => false,
          staticRoot: path.resolve('apps/web/dist'),
        }),
      );
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      origin = `http://127.0.0.1:${server.address().port}`;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const dir = `test-results/review-repair/qa-${kind}`;
    fs.mkdirSync(dir, { recursive: true });
    try {
      await page.goto(origin);
      await page.getByTestId('pre-gate-black-opening').waitFor({ timeout: 60000 });
      await page.screenshot({ path: `${dir}/1-black-opening.png` });
      for (let i = 0; i < 4; i++) await page.getByTestId('pre-gate-continue').click();
      await page.getByRole('spinbutton').first().waitFor();
      assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
      const invalid = code === '9999' ? '8888' : '9999';
      for (let i = 0; i < 4; i++) await page.getByRole('spinbutton').nth(i).press(invalid[i]);
      const rejected = page.waitForResponse(
        (r) => r.url().endsWith('/api/auth/gate') && r.request().method() === 'POST',
      );
      await page.locator('button[type=submit]').click();
      assert.equal((await rejected).status(), 401);
      for (let i = 0; i < 4; i++) await page.getByRole('spinbutton').nth(i).press(code[i]);
      const authenticated = page.waitForResponse(
        (r) => r.url().endsWith('/api/auth/gate') && r.request().method() === 'POST',
      );
      await page.locator('button[type=submit]').click();
      const login = await authenticated;
      assert.equal(login.status(), 200);
      assert.equal((await login.json()).session.userId, userId);
      await page.getByTestId('doors-opening-continue').waitFor({ timeout: 30000 });
      assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
      await page.screenshot({ path: `${dir}/2-doors.png` });
      await page.getByTestId('doors-opening-continue').click();
      await page.getByTestId('beach-arrival-continue').click();
      await expect(page.getByTestId('naming-name-input')).toHaveValue('');
      await page.getByTestId('naming-name-input').fill('Review QA');
      await page.getByTestId('naming-gender-female').check();
      await page.getByTestId('naming-submit').click();
      await expect(page.getByTestId('collar-name')).toHaveText('Review QA', { timeout: 30000 });
      assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
      await page.getByTestId('naming-continue').click();
      await page.getByTestId('world-experience').waitFor({ timeout: 60000 });
      if (kind === 'birthday') {
        if (await page.getByTestId('narration-continue').isVisible())
          await page.getByTestId('narration-continue').click();
        await page.getByTestId('birthday-invitation').waitFor({ timeout: 15000 });
        await page.screenshot({ path: `${dir}/3-first-eligible-invitation.png` });
      }
      results.push({
        kind,
        userId,
        wrongCodeRejected: true,
        loginIsSynthetic: true,
        blackGateDoorsNaming: true,
        invitationAfterOnboarding: kind === 'birthday',
      });
      console.log(
        `PASS ${kind}: black opening → real Gate validation → synthetic session → doors → empty naming → world.`,
      );
    } finally {
      await context.close();
      await new Promise((r) => server.close(r));
    }
  }
  for (const tab of REVIEW_STATE_TABS)
    assert.equal(
      (await source.readTab(tab, { bypass: true, strict: true })).rows.filter(
        (r) => r.raw.user_id === final.userId,
      ).length,
      0,
      `Final review must remain unplayed: ${tab}`,
    );
  fs.writeFileSync(
    'test-results/review-repair/verified-opening.json',
    JSON.stringify({ results, finalUserId: final.userId, finalGameplayRows: 0 }, null, 2),
  );
  console.log(`PASS final review ${final.userId}: zero gameplay/reward rows, untouched by QA.`);
} finally {
  await browser.close();
}

process.exit(0);
