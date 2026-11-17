import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.INKLING_E2E_WORKSPACE ??= mkdtempSync(
  join(tmpdir(), 'inkling-e2e-'),
);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4329', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm build && PORT=4329 node apps/server/dist/main.js',
    env: { INKLING_WORKSPACE: process.env.INKLING_E2E_WORKSPACE },
    url: 'http://127.0.0.1:4329/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
