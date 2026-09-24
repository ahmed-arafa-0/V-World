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
    // Deliberately NOT `BASE_URL` (hosting's static root) — the Hosting
    // emulator serves index.html immediately regardless of whether the
    // Functions emulator has finished loading the `api` function, so that
    // check was satisfied ~10s before the backend could actually answer
    // any `/api/*` request. An unrouted `/api/*` request 404s while
    // Functions is still loading, and Playwright's own readiness check
    // (isURLAvailable) explicitly treats 404 as "not ready" (only
    // 200-403 counts) — so polling a real backend route here genuinely
    // waits for the Functions emulator, not just the static file server.
    // Root-caused via firebase-debug.log: "All emulators ready!" printed
    // ~10s after Playwright had already started sending test traffic,
    // producing "Could not reach the backend" on the very first request.
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
