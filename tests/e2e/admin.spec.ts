import { expect, test } from '@playwright/test';

test.describe('Admin', () => {
  test('shows the Schema Health view, the M02 auth notice, and a link back home', async ({
    page,
  }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();
    await expect(page.getByText(/no authentication implemented yet/i)).toBeVisible();
    await expect(page.getByText('Expected tabs')).toBeVisible();
    await expect(page.getByText('42', { exact: true }).first()).toBeVisible();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tab' })).toBeVisible();

    const homeLink = page.getByRole('link', { name: /back to home/i });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('search filters the tab table', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('rowheader', { name: '01_APP_CONFIG' })).toBeVisible();

    await page.getByLabel(/search tabs/i).fill('11_LOCATIONS');
    await expect(page.getByRole('rowheader', { name: '11_LOCATIONS' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: '01_APP_CONFIG' })).not.toBeVisible();
  });

  test('bypass-cache refresh control works without error', async ({ page }) => {
    await page.goto('/admin');
    const refreshButton = page.getByRole('button', { name: /bypass cache and refresh/i });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    await expect(page.getByText('Expected tabs')).toBeVisible();
  });
});
