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

  test('GET /api/admin/schema-health (unauthenticated, 401) never leaks credential, secret, or raw row content', async ({
    page,
  }) => {
    const response = await page.request.get('/api/admin/schema-health');
    expect(response.status()).toBe(401);
    const text = await response.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text).not.toContain(pattern);
    }
  });

  test('GET /api/content/runtime (unauthenticated, 401) never leaks credential, secret, or a raw Drive file ID', async ({
    page,
  }) => {
    const response = await page.request.get('/api/content/runtime');
    expect(response.status()).toBe(401);
    const text = await response.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(text).not.toContain(pattern);
    }
    expect(text).not.toMatch(/"driveFileId"/);
  });

  test('Gate/Admin login responses never leak the correct code/password on failure', async ({
    page,
  }) => {
    const gateResponse = await page.request.post('/api/auth/gate', {
      data: {
        digits: ['0', '0', '0', '0'],
        deviceId: 'net-sec-test-device',
        attemptId: `net-sec-gate-${Date.now()}`,
      },
    });
    const gateText = await gateResponse.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(gateText).not.toContain(pattern);
    }
    expect(gateText).not.toMatch(/"sessionId"/);

    const adminResponse = await page.request.post('/api/auth/admin', {
      data: {
        username: 'admin_ahmed',
        password: 'deliberately-wrong',
        deviceId: 'net-sec-test-device',
        attemptId: `net-sec-admin-${Date.now()}`,
      },
    });
    const adminText = await adminResponse.text();
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(adminText).not.toContain(pattern);
    }
    expect(adminText).not.toMatch(/"sessionId"/);
  });
});
