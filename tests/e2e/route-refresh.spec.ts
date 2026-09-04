import { expect, test } from '@playwright/test';

test.describe('Direct route refresh through the Hosting emulator', () => {
  test('reloading /admin does not 404 and re-renders the Admin placeholder', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();

    const reloadResponse = await page.reload();
    expect(reloadResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();
  });

  test('a fresh navigation directly to /admin (not client-side) is served by the SPA rewrite', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();

    await context.close();
  });
});
