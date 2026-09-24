import fs from 'node:fs';
import path from 'node:path';
import { firefox } from '@playwright/test';
const origin = 'http://localhost:5051';
const manifest = JSON.parse(
  fs.readFileSync('test-results/review-repair/fresh-review.json', 'utf8'),
);
const health = await fetch(`${origin}/api/health`);
if (health.headers.get('X-Review-Player') !== manifest.userId)
  throw Error('Ordinary review identity mismatch.');
const profile = path.resolve('test-results/review-repair/browser-profile');
const context = await firefox.launchPersistentContext(profile, { headless: false, viewport: null });
const page = context.pages()[0] ?? (await context.newPage());
if (process.argv.includes('--clear-review-state')) {
  await context.clearCookies();
  await page.goto(origin);
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
  });
}
await page.goto(origin);
console.log(
  `Ordinary review ${manifest.userId}: ${origin}. Dedicated browser profile; normal Gate authentication.`,
);
if (process.argv.includes('--clear-review-state')) {
  await page.getByTestId('pre-gate-black-opening').waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'test-results/review-repair/fresh-black-opening.png' });
  console.log('Unplayed black opening verified.');
}
