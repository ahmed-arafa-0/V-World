import { expect, test, type Page } from '@playwright/test';
import { skipGateOpening } from './helpers/preGate';

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

test.describe('Gate — pre-Gate opening sequence (black → title → unseen VAR → reveal)', () => {
  test('plays once, against the real (public) pre-gate content endpoint, then reveals the dials', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('pre-gate-sequence')).toHaveAttribute('data-phase', 'opening');
    await expect(page.getByTestId('var-reveal-placeholder')).toHaveCount(0);

    await page.getByTestId('pre-gate-continue').click();
    await expect(page.getByTestId('pre-gate-sequence')).toHaveAttribute('data-phase', 'title');
    await expect(page.getByTestId('pre-gate-title')).not.toBeEmpty();

    await page.getByTestId('pre-gate-continue').click();
    await expect(page.getByTestId('pre-gate-sequence')).toHaveAttribute('data-phase', 'unseen');
    // Real narration text from the live Sheet's dlg_gate_01 — never empty.
    await expect(page.getByTestId('dialogue-text-line')).not.toBeEmpty();

    await page.getByTestId('pre-gate-continue').click();
    await expect(page.getByTestId('pre-gate-sequence')).toHaveAttribute('data-phase', 'reveal');
    await expect(page.getByTestId('var-reveal-placeholder')).toBeVisible();

    await page.getByTestId('pre-gate-continue').click();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
  });

  test('does not replay after the dials are reached once in this tab (sessionStorage)', async ({
    page,
  }) => {
    await page.goto('/');
    for (let i = 0; i < 4; i++) await page.getByTestId('pre-gate-continue').click();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
    await expect(page.getByTestId('pre-gate-sequence')).toHaveCount(0);
  });
});

test.describe('Gate — initial render and interaction', () => {
  test.beforeEach(async ({ page }) => {
    await skipGateOpening(page);
  });

  test('shows the Gate with four digit dials, all starting at 0', async ({ page }) => {
    await page.goto('/');
    // The immersive Gate has no page heading (Phase 1 presentation decision); the dials are the landmark.
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

  test('keyboard: typing four digits with no click or dial focus fills all four dials in order', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    await page.keyboard.type('1234');

    const dials = page.getByRole('spinbutton');
    await expect(dials.nth(0)).toHaveAttribute('aria-valuenow', '1');
    await expect(dials.nth(1)).toHaveAttribute('aria-valuenow', '2');
    await expect(dials.nth(2)).toHaveAttribute('aria-valuenow', '3');
    await expect(dials.nth(3)).toHaveAttribute('aria-valuenow', '4');
  });

  test('keyboard: Backspace corrects a mistyped digit, and Enter with fewer than four does not submit', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    await page.keyboard.type('12');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');

    const dials = page.getByRole('spinbutton');
    await expect(dials.nth(0)).toHaveAttribute('aria-valuenow', '1');
    await expect(dials.nth(1)).toHaveAttribute('aria-valuenow', '9');
    // Only two of four digits were entered — Enter must not have submitted.
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
    await expect(page.getByText(/incorrect code/i)).toHaveCount(0);
  });

  test('keyboard: Enter after exactly four typed digits submits', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    await page.keyboard.type('0000');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/incorrect code/i)).toBeVisible();
  });
});

test.describe('Gate — successful owner login (requires E2E_GATE_CODE)', () => {
  test.skip(!REAL_GATE_CODE, 'E2E_GATE_CODE is not set in this environment');
  test.beforeEach(async ({ page }) => {
    await skipGateOpening(page);
  });

  test('correct code grants access, refresh resumes the session, and logout returns to the Gate', async ({
    page,
  }) => {
    await page.goto('/');
    await enterDigits(page, REAL_GATE_CODE!.trim());
    await page.getByRole('button', { name: /enter/i }).click();

    await expect(page.getByText(/access granted/i)).toBeVisible();
    await expect(page.getByTestId('content-runtime-lab')).toBeVisible();

    // Refresh must resume the valid owner session from the HttpOnly cookie, not re-show the dials.
    await page.reload();
    await expect(page.getByText(/access granted/i)).toBeVisible();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toHaveCount(0);

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();
  });
});
