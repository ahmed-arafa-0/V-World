import { defineConfig, devices } from '@playwright/test';

const PORT = 5050;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // This suite calls the real Google Sheets API through the local emulator
  // (no fakes in e2e). Cold Functions-emulator starts and live network
  // round-trips are slower and less predictable than same-process unit
  // tests, so we run serially with generous timeouts rather than racing
  // multiple workers against one backend and a rate-limited external API.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run emulators:build',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
