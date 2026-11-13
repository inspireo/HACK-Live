import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { launchOptions: { slowMo: 150 }, baseURL: 'http://127.0.0.1:3000', viewport: { width: 1100, height: 760 }, video: { mode: 'on', size: { width: 1100, height: 760 } }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
