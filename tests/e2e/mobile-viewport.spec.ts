import { expect, test } from '@playwright/test';
import { skipGateOpening } from './helpers/preGate';

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Gate renders without horizontal overflow on a small screen', async ({ page }) => {
    await skipGateOpening(page);
    await page.goto('/');
    // The immersive Gate has no page heading (Phase 1 presentation decision); the dials are the landmark.
    await expect(page.getByRole('group', { name: /four-digit gate code/i })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Admin login form renders without horizontal overflow on a small screen', async ({
    page,
  }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
