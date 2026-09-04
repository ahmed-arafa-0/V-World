import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dirname, '..', 'docs', 'reports', 'M01');
mkdirSync(outDir, { recursive: true });

const baseUrl = 'http://127.0.0.1:5050';

async function capture(browserType, contextOptions, pagePath, waitForText, fileName) {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(`${baseUrl}${pagePath}`);
  await page.waitForSelector(`text=${waitForText}`, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  await browser.close();
}

await capture(
  chromium,
  { viewport: { width: 1440, height: 900 } },
  '/',
  'Locations',
  'home-sheet-connected-desktop.png',
);
await capture(
  chromium,
  { viewport: { width: 1440, height: 900 } },
  '/admin',
  'Expected tabs',
  'admin-schema-health-desktop.png',
);
await capture(
  chromium,
  { ...devices['Pixel 7'] },
  '/',
  'Locations',
  'home-sheet-connected-mobile.png',
);
await capture(
  chromium,
  { ...devices['Pixel 7'] },
  '/admin',
  'Expected tabs',
  'admin-schema-health-mobile.png',
);

console.log('Screenshots written to', outDir);
