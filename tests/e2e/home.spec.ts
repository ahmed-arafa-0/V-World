import { expect, test } from '@playwright/test';

test.describe('Home', () => {
  test('shows the M01 title, live Sheet connection, schema health, and bootstrap counts', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: "Veoulla's World" })).toBeVisible();
    await expect(page.getByText('M01 — Google Sheets Gateway')).toBeVisible();
    await expect(page.getByText(/backend status: online/i)).toBeVisible();
    await expect(page.getByText(/google sheet connection: connected/i)).toBeVisible();
    await expect(page.getByText(/schema health:/i)).toBeVisible();

    await expect(page.getByText('Languages')).toBeVisible();
    await expect(page.getByText('Locations')).toBeVisible();
    await expect(page.getByText('First-journey beats')).toBeVisible();

    const adminLink = page.getByRole('link', { name: /admin schema health/i });
    await expect(adminLink).toBeVisible();
    await adminLink.click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
