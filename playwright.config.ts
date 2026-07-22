import { defineConfig, devices } from '@playwright/test';

// Keep this in sync with vite.config.ts's `base` - if you rename the repo, update both.
const BASE_PATH = '/wendler-tracker/';
const PORT = 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Small viewport by default - this is a phone-first app, test it like one.
    viewport: { width: 390, height: 844 },
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    // Uncomment once the chromium suite is green - webkit catches Safari-specific
    // IndexedDB/service-worker quirks that are worth knowing about on an iPhone.
    // { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 } } },
  ],

  // Builds the real production bundle and serves it, so the service worker test
  // exercises actual hashed assets - not vite dev's unbundled module serving.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
