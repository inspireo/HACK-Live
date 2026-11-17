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

// Actual Chromium permission control; no clipboard object or result replacement.
export async function denyClipboard(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { targetInfo } = await session.send('Target.getTargetInfo');
    await session.send('Browser.setPermission', {
      permission: { name: 'clipboard-write' }, setting: 'denied',
      origin: new URL(page.url()).origin, browserContextId: targetInfo.browserContextId,
    });
  } finally { await session.detach(); }
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })).state)).toBe('denied');
}
