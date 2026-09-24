#!/usr/bin/env node
/** Dedicated local birthday review. Never prints authentication material.
 * serve --open | open | scenario before|final20|live|late-arrival|replay|countdown-only|clear [--open] [--fresh]
 * --fresh backs up/resets only the selected birthday review player before the chosen scenario.
 */
import fs from 'node:fs';
import path from 'node:path';
import { firefox } from '@playwright/test';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { resetReviewPlayer } from './review-support/reset-review-player.mjs';
import {
  BIRTHDAY_ORIGIN,
  prepareBirthdayReviewer,
  startBirthdayServer,
  setBirthdayScenario,
  seedBirthdayReviewer,
  reviewRequest,
} from './review-support/birthday-review.mjs';
const [, , command = 'serve', scenario] = process.argv;
const prepared = await prepareBirthdayReviewer();
const { manifest, source } = prepared;
if (process.argv.includes('--fresh')) {
  await resetReviewPlayer(createGoogleSheetsClientOrNull(), manifest.userId);
  await seedBirthdayReviewer(source, manifest.userId);
  if (command !== 'serve') {
    const deadline = Date.now() + 30000;
    while (
      (await reviewRequest(BIRTHDAY_ORIGIN, manifest, '/api/world/birthday')).stage.giftsClaimed
    ) {
      if (Date.now() > deadline) throw Error('Server has not observed fresh birthday state.');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
if (command === 'serve') {
  await startBirthdayServer(prepared);
  console.log(`Birthday review ${manifest.userId}: ${BIRTHDAY_ORIGIN}`);
} else if (command === 'scenario' && !process.argv.includes('--open'))
  await setBirthdayScenario(BIRTHDAY_ORIGIN, manifest, scenario);
else if (!['open', 'scenario', 'setup'].includes(command))
  throw Error('Use serve --open, open, or scenario <name> [--open] [--fresh].');
if (command === 'setup')
  console.log(`Prepared ${manifest.userId}. Start: node scripts/birthday-preview.mjs serve --open`);
if (command === 'open' || process.argv.includes('--open')) {
  const profile = path.resolve('test-results/birthday-review/browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const context = await firefox.launchPersistentContext(profile, {
    headless: false,
    viewport: null,
  });
  await context.addCookies([
    {
      name: 'vw_owner_session',
      value: manifest.ownerSessionId,
      url: BIRTHDAY_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = context.pages()[0] ?? (await context.newPage());
  // Load the world first so the actual 20-second window is available to watch.
  if (command === 'scenario') await setBirthdayScenario(BIRTHDAY_ORIGIN, manifest, 'before');
  await page.goto(BIRTHDAY_ORIGIN);
  await page.getByTestId('world-experience').waitFor({ timeout: 60000 });
  if (command === 'scenario') {
    await setBirthdayScenario(BIRTHDAY_ORIGIN, manifest, scenario);
    if (scenario === 'final20') {
      await page.getByTestId('birthday-celebrate-now').waitFor({ timeout: 20000 });
      await page.getByTestId('birthday-celebrate-now').click();
    } else if (scenario === 'replay' || scenario === 'countdown-only') {
      await page.reload();
      await page.getByTestId('birthday-entry').click();
      await page
        .getByTestId(
          scenario === 'replay' ? 'birthday-replay-celebration' : 'birthday-replay-countdown-only',
        )
        .click();
    }
  }
  console.log(
    'Separate birthday browser is open. Close this window before using another --open command.',
  );
}
