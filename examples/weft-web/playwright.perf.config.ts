// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §T26 — Playwright config for perf harness (chromium-only, sequential)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/perf',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 300_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-perf-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter weft-web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
