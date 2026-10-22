import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/forestry-lidar-catalogue/', browserName: 'chromium' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: 'python3 tests/e2e/serve.py',
    url: 'http://127.0.0.1:4173/forestry-lidar-catalogue/',
    reuseExistingServer: !process.env.CI,
  },
});
