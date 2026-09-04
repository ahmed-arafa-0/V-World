import { expect, test } from '@playwright/test';

test.describe('Home', () => {
  test('shows the M00 foundation placeholder and a link to Admin', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: "Veoulla's World" })).toBeVisible();
    await expect(page.getByText('Foundation Build')).toBeVisible();
    await expect(page.getByText('M00', { exact: true })).toBeVisible();
    await expect(page.getByText(/frontend status: online/i)).toBeVisible();

    const adminLink = page.getByRole('link', { name: /admin placeholder/i });
    await expect(adminLink).toBeVisible();
    await adminLink.click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
