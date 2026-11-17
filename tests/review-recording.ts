import { expect, test, type Page } from '@playwright/test';

// Recording helpers are inert in the normal regression suite.
export const reviewRecording = process.env.REVIEW_RECORDINGS === 'true';
export async function readingHold(page: Page, stage: string, milliseconds = 2400) {
  if (!reviewRecording) return;
  await page.screenshot({ path: test.info().outputPath(`${stage}.png`) });
  await page.waitForTimeout(milliseconds);
}
export async function readHelp(page: Page, label: string) {
  if (!reviewRecording) return;
  const trigger = page.getByRole('button', { name: `Help: ${label}`, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus(); await trigger.press('Enter');
  await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
  await readingHold(page, `help-${label.replace(/[^a-z0-9]+/gi, '-')}`);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
}
