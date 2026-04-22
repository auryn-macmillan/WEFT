// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §Parity Test Harness — T23 Playwright config
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/parity',
  fullyParallel: false,
  timeout: 300_000,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'node',
      testMatch: '**/*.test.ts',
    },
  ],
  reporter: [['list'], ['json', { outputFile: '.sisyphus/evidence/task-23-playwright-results.json' }]],
});
