import { expect, test } from '@playwright/test';

test.describe('Backend health display', () => {
  test('Home displays a live backend health status resolved through the same-origin API', async ({
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
    expect(body.milestone).toBe('M00');

    await expect(page.getByText(/backend status: online/i)).toBeVisible();
  });

  test('Admin displays a live backend health status resolved through the same-origin API', async ({
    page,
  }) => {
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/health')),
      page.goto('/admin'),
    ]);

    expect(response.status()).toBe(200);
    await expect(page.getByText(/backend status: online/i)).toBeVisible();
  });
});
