import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }], ...(process.env.REVIEW_RECORDINGS === 'true' ? [['./scripts/review-demo-reporter.mjs'] as [string]] : [])],
  use: { launchOptions: { args: process.env.REVIEW_RECORDINGS === 'true' ? ['--disable-blink-features=WebShare'] : [], slowMo: process.env.REVIEW_RECORDINGS === 'true' || process.env.AWARDS_DEMO === 'true' || process.env.ATTENDANCE_DEMO === 'true' || process.env.PARTICIPATION_DEMO === 'true' ? 150 : 0 }, baseURL: 'http://127.0.0.1:3000', viewport: { width: 1100, height: 760 }, video: { mode: 'on', size: { width: 1100, height: 760 } }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
