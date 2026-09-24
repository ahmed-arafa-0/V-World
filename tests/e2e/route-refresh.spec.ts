import { expect, test } from '@playwright/test';
import { skipGateOpening } from './helpers/preGate';

test.describe('Direct route refresh through the Hosting emulator', () => {
  test('reloading /admin does not 404 and re-renders the Admin login form', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

    const reloadResponse = await page.reload();
    expect(reloadResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  });

  test('a fresh navigation directly to /admin (not client-side) is served by the SPA rewrite', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await context.close();
  });

  test('reloading / does not 404 and re-renders the Gate', async ({ page }) => {
    await skipGateOpening(page);
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    const reloadResponse = await page.reload();
    expect(reloadResponse?.ok()).toBe(true);
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
  });
});
