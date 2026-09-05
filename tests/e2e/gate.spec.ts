import { expect, test, type Page } from '@playwright/test';

/**
 * Gate coverage against the real Sheet (via the local Firebase emulators —
 * see playwright.config.ts). Never prints or screenshots the real Gate
 * code or any entered digit combination. Tests that need the real code to
 * succeed read it ONLY from process.env.E2E_GATE_CODE (never hardcoded,
 * never logged) and skip gracefully — not fail — when it isn't set locally.
 */

const REAL_GATE_CODE = process.env.E2E_GATE_CODE;

async function focusDial(page: Page, index: number) {
  const dial = page.getByRole('spinbutton').nth(index);
  await dial.focus();
  return dial;
}

async function enterDigits(page: Page, digits: string) {
  for (let i = 0; i < digits.length; i++) {
    const dial = await focusDial(page, i);
    await dial.press(digits[i]!);
  }
}

test.describe('Gate — initial render and interaction', () => {
  test('shows the Gate with four digit dials, all starting at 0', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: "Veoulla's World" })).toBeVisible();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    const dials = page.getByRole('spinbutton');
    await expect(dials).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(dials.nth(i)).toHaveAttribute('aria-valuenow', '0');
    }
  });

  test('keyboard interaction: ArrowUp increments a focused dial', async ({ page }) => {
    await page.goto('/');
    const dial = await focusDial(page, 0);
    await dial.press('ArrowUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '1');
  });

  test('keyboard interaction: typing a digit sets a focused dial directly', async ({ page }) => {
    await page.goto('/');
    const dial = await focusDial(page, 1);
    await dial.press('7');
    await expect(dial).toHaveAttribute('aria-valuenow', '7');
  });

  test('pointer interaction: clicking the increase button advances a dial', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /increase first digit/i }).click();
    await expect(page.getByRole('spinbutton').first()).toHaveAttribute('aria-valuenow', '1');
  });

  test('shows generic invalid feedback for a wrong code, never revealing the correct one', async ({
    page,
  }) => {
    await page.goto('/');
    await enterDigits(page, '0000');
    await page.getByRole('button', { name: /enter/i }).click();

    await expect(page.getByText(/incorrect code/i)).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\d{4}/);
  });
});

test.describe('Gate — successful owner login (requires E2E_GATE_CODE)', () => {
  test.skip(!REAL_GATE_CODE, 'E2E_GATE_CODE is not set in this environment');

  test('correct code grants access, refresh resumes the session, and logout returns to the Gate', async ({
    page,
  }) => {
    await page.goto('/');
    await enterDigits(page, REAL_GATE_CODE!.trim());
    await page.getByRole('button', { name: /enter/i }).click();

    await expect(page.getByText(/access granted/i)).toBeVisible();
    await expect(page.getByText(/world loading/i)).toBeVisible();

    // Refresh must resume the valid owner session from the HttpOnly cookie, not re-show the dials.
    await page.reload();
    await expect(page.getByText(/access granted/i)).toBeVisible();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toHaveCount(0);

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
  });
});
