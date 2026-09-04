import { expect, test } from '@playwright/test';

const FORBIDDEN_PATTERNS = [
  'private_key',
  'BEGIN PRIVATE KEY',
  'client_email',
  'gate_code_plaintext',
  'admin_password_plaintext',
  'plaintext_value',
  'gserviceaccount.com',
  'config-private',
];

test.describe('Network response security boundary', () => {
  test('GET /api/health never leaks credential or secret content', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.ok()).toBe(true);
    const text = await response.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text).not.toContain(pattern);
    }
  });

  test('GET /api/bootstrap never leaks credential, secret, or Drive file ID content', async ({
    page,
  }) => {
    const response = await page.request.get('/api/bootstrap');
    expect(response.ok()).toBe(true);
    const text = await response.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text).not.toContain(pattern);
    }
    expect(text).not.toMatch(/"driveFileId"/);
  });

  test('GET /api/admin/schema-health never leaks credential, secret, or raw row content', async ({
    page,
  }) => {
    const response = await page.request.get('/api/admin/schema-health');
    expect(response.ok()).toBe(true);
    const text = await response.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text).not.toContain(pattern);
    }
  });
});
