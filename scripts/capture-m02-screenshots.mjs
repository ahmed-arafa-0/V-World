import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures M02 screenshots against the local Firebase emulators (must
 * already be running at http://127.0.0.1:5050 — e.g. `npm run
 * emulators:build` in another terminal). Never types a real Gate code or
 * Admin password unless Ahmed has set E2E_GATE_CODE / E2E_ADMIN_PASSWORD
 * locally; those two env vars are read only to fill the form, never
 * printed, and the two credential-gated screenshots are simply skipped
 * (not faked) when they are absent.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dirname, '..', 'docs', 'reports', 'M02');
mkdirSync(outDir, { recursive: true });

const baseUrl = 'http://127.0.0.1:5050';

async function withPage(browserType, contextOptions, run) {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

async function captureGate(browserType, contextOptions, fileName) {
  await withPage(browserType, contextOptions, async (page) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector('role=group[name=/four-digit gate code/i]', { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  });
}

async function captureAdminLogin(browserType, contextOptions, fileName) {
  await withPage(browserType, contextOptions, async (page) => {
    await page.goto(`${baseUrl}/admin`);
    await page.waitForSelector('text=Sign in', { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  });
}

async function captureOwnerAccessGranted(browserType, contextOptions, fileName, gateCode) {
  await withPage(browserType, contextOptions, async (page) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector('role=group[name=/four-digit gate code/i]', { timeout: 20000 });
    const digits = gateCode.trim().split('');
    for (let i = 0; i < digits.length; i++) {
      const dial = page.getByRole('spinbutton').nth(i);
      await dial.focus();
      await dial.press(digits[i]);
    }
    await page.getByRole('button', { name: /enter/i }).click();
    await page.waitForSelector('text=Access granted', { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
    // Terminate the session this capture created — never leave it dangling.
    await page
      .getByRole('button', { name: /log out/i })
      .click()
      .catch(() => {});
  });
}

async function captureAdminSchemaHealth(browserType, contextOptions, fileName, username, password) {
  await withPage(browserType, contextOptions, async (page) => {
    await page.goto(`${baseUrl}/admin`);
    await page.waitForSelector('text=Sign in', { timeout: 20000 });
    await page.getByLabel(/username/i).fill(username);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForSelector('text=Expected tabs', { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
    await page
      .getByRole('button', { name: /log out/i })
      .click()
      .catch(() => {});
  });
}

const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { ...devices['Pixel 7'] };

await captureGate(chromium, desktop, 'gate-desktop.png');
await captureGate(chromium, mobile, 'gate-mobile.png');
await captureAdminLogin(chromium, desktop, 'admin-login-desktop.png');
await captureAdminLogin(chromium, mobile, 'admin-login-mobile.png');

const gateCode = process.env.E2E_GATE_CODE;
if (gateCode) {
  await captureOwnerAccessGranted(chromium, desktop, 'owner-access-granted-desktop.png', gateCode);
  console.log('Captured owner-access-granted-desktop.png');
} else {
  console.log('SKIPPED owner-access-granted screenshot — E2E_GATE_CODE is not set locally.');
}

const adminPassword = process.env.E2E_ADMIN_PASSWORD;
if (adminPassword) {
  await captureAdminSchemaHealth(
    chromium,
    desktop,
    'admin-schema-health-desktop.png',
    'admin_ahmed',
    adminPassword,
  );
  await captureAdminSchemaHealth(
    chromium,
    mobile,
    'admin-schema-health-mobile.png',
    'admin_ahmed',
    adminPassword,
  );
  console.log('Captured admin-schema-health-desktop.png and admin-schema-health-mobile.png');
} else {
  console.log(
    'SKIPPED authenticated Admin Schema Health screenshots — E2E_ADMIN_PASSWORD is not set locally.',
  );
}

console.log('Screenshots written to', outDir);
