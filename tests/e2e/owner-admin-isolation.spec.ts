import { expect, test } from '@playwright/test';
import { skipGateOpening } from './helpers/preGate';

/**
 * Proves owner (Gate) and Admin authentication are fully independent —
 * against the real Sheet. Requires both E2E_GATE_CODE and
 * E2E_ADMIN_PASSWORD; skips gracefully otherwise rather than guessing.
 */

const ADMIN_USERNAME = 'admin_ahmed';
const REAL_GATE_CODE = process.env.E2E_GATE_CODE;
const REAL_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe('Owner/Admin session isolation', () => {
  test.skip(
    !REAL_GATE_CODE || !REAL_ADMIN_PASSWORD,
    'requires both E2E_GATE_CODE and E2E_ADMIN_PASSWORD to establish both sessions at once',
  );

  test('an owner (Gate) login does not grant Admin access, and vice versa', async ({ page }) => {
    // Owner login only — Admin surface must still require its own login.
    await skipGateOpening(page);
    await page.goto('/');
    const digits = REAL_GATE_CODE!.trim();
    for (let i = 0; i < digits.length; i++) {
      const dial = page.getByRole('spinbutton').nth(i);
      await dial.focus();
      await dial.press(digits[i]!);
    }
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByText(/access granted/i)).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();

    const schemaHealthWithOwnerOnly = await page.request.get('/api/admin/schema-health');
    expect(schemaHealthWithOwnerOnly.status()).toBe(401);

    // Now also log in as Admin — both sessions coexist.
    await page.getByLabel(/username/i).fill(ADMIN_USERNAME);
    await page.getByLabel(/password/i).fill(REAL_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();

    // Owner session must still be intact — logging into Admin didn't disturb it.
    await page.goto('/');
    await expect(page.getByText(/access granted/i)).toBeVisible();

    // Logging out the owner must not affect the still-active Admin session.
    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Schema Health' })).toBeVisible();

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  });
});
