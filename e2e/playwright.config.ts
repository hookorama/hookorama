import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.e2e.test.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'bun run --cwd packages/supervisor start',
      url: 'http://127.0.0.1:7354/api/state',
      timeout: 20000,
      reuseExistingServer: true,
      cwd: '..',
      env: { E2E_ALLOW_RESET: '1' },
    },
    {
      command: 'bun packages/cli/dist/main.mjs dashboard',
      url: 'http://127.0.0.1:3000',
      timeout: 20000,
      reuseExistingServer: true,
      cwd: '..',
    },
  ],
});
