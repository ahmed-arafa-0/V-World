import { expect, test } from '@playwright/test';

test.describe('Backend health display', () => {
  test('Home displays a live backend/Sheet health status resolved through the same-origin API', async ({
    page,
  }) => {
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/health')),
      page.goto('/'),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('veoullas-world-functions');
    expect(body.milestone).toBe('M01');
    expect(body.sheets.reachable).toBe(true);

    await expect(page.getByText(/backend status: online/i)).toBeVisible();
    await expect(page.getByText(/google sheet connection: connected/i)).toBeVisible();
  });

  test('Admin displays a live schema-health summary resolved through the same-origin API', async ({
    page,
  }) => {
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/admin/schema-health')),
      page.goto('/admin'),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.summary.expectedTabCount).toBe(42);

    await expect(page.getByText('Expected tabs')).toBeVisible();
  });
});
