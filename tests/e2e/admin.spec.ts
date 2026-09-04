import { expect, test } from '@playwright/test';

test.describe('Admin', () => {
  test('shows the Admin foundation placeholder and a link back home', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin Foundation' })).toBeVisible();
    await expect(page.getByText('M00', { exact: true })).toBeVisible();
    await expect(page.getByText(/no authentication implemented yet/i)).toBeVisible();

    const homeLink = page.getByRole('link', { name: /back to home/i });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL(/\/$/);
  });
});
