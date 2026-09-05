import { expect, test } from '@playwright/test';

/**
 * Admin coverage against the real Sheet (via the local Firebase emulators).
 * Never prints or screenshots the real Admin password. Tests that need the
 * real password to succeed read it ONLY from process.env.E2E_ADMIN_PASSWORD
 * (never hardcoded, never logged) and skip gracefully when it isn't set.
 * `admin_ahmed` is a stable, non-secret username — safe to reference here.
 */

const ADMIN_USERNAME = 'admin_ahmed';
const REAL_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('Admin — login gate', () => {
  test('shows the Admin login form when unauthenticated, with a masked password field', async ({
    page,
  }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('protected schema-health is inaccessible without a session', async ({ page }) => {
    const response = await page.request.get('/api/admin/schema-health');
    expect(response.status()).toBe(401);
  });

  test('shows generic feedback on wrong credentials and never repopulates the password', async ({
    page,
  }) => {
    await page.goto('/admin');
    await page.getByLabel(/username/i).fill(ADMIN_USERNAME);
    const passwordInput = page.getByLabel(/password/i);
    await passwordInput.fill('deliberately-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/incorrect username or password/i)).toBeVisible();
    await expect(passwordInput).toHaveValue('');
  });
});

test.describe('Admin — successful login (requires E2E_ADMIN_PASSWORD)', () => {
  test.skip(!REAL_ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD is not set in this environment');

  test('logs in, shows Schema Health, survives a direct refresh, and logs out', async ({
    page,
  }) => {
    await page.goto('/admin');
    await page.getByLabel(/username/i).fill(ADMIN_USERNAME);
    await page.getByLabel(/password/i).fill(REAL_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();
    await expect(page.getByText('Expected tabs')).toBeVisible();
    await expect(page.getByText('42', { exact: true }).first()).toBeVisible();

    // Direct refresh on /admin must resume the Admin session, not drop back to the login form.
    const reloadResponse = await page.reload();
    expect(reloadResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
  });
});
