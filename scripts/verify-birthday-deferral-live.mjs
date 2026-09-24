import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
  reviewRequest,
} from './review-support/birthday-review.mjs';
const prepared = await prepareBirthdayReviewer({
  userId: `manual_review_bday_deferral_${Date.now()}`,
  manifestPath: null,
});
const { server, origin } = await startBirthdayServer({ ...prepared, port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ reducedMotion: 'reduce' });
await page.context().addCookies([
  {
    name: 'vw_owner_session',
    value: prepared.manifest.ownerSessionId,
    url: origin,
    httpOnly: true,
  },
]);
try {
  await setBirthdayScenario(origin, prepared.manifest, 'before');
  await page.goto(origin);
  await page.getByTestId('world-experience').waitFor({ timeout: 60000 });
  await page.getByTestId('open-map').click();
  await page.getByTestId('map-pin-church').click();
  await page.getByTestId('church-interior').waitFor();
  await setBirthdayScenario(origin, prepared.manifest, 'live');
  await page.waitForTimeout(5500);
  assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
  assert.equal(await page.getByTestId('birthday-entry').count(), 0);
  await setBirthdayScenario(origin, prepared.manifest, 'before');
  await page.waitForTimeout(5500);
  await page.getByTestId('open-map').click();
  await page.getByTestId('map-pin-arcade').click();
  await page.getByTestId('arcade-interior').waitFor();
  const arcade = await reviewRequest(origin, prepared.manifest, '/api/world/arcade');
  const free =
    arcade.games.find((g) => g.unlocked && g.family === 'memory') ??
    arcade.games.find((g) => g.unlocked);
  assert.ok(free, 'Existing free game required; never unlock/spend for this check');
  await page.getByTestId(`cabinet-${free.cabinetSlot}`).click();
  await page.getByTestId('arcade-game-panel').waitFor();
  await setBirthdayScenario(origin, prepared.manifest, 'live');
  await page.waitForTimeout(5500);
  assert.equal(await page.getByTestId('birthday-invitation').count(), 0);
  await page.getByTestId('arcade-game-panel-close').click();
  await page.getByTestId('birthday-invitation').waitFor({ timeout: 15000 });
  fs.writeFileSync(
    'test-results/birthday-review/deferral.json',
    JSON.stringify(
      {
        userId: prepared.manifest.userId,
        churchDeferred: true,
        activeGameDeferred: true,
        invitesAfterGameClosed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS real rendered Church and active Arcade defer birthday; closing game shows queued invitation.',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
process.exit(0);
