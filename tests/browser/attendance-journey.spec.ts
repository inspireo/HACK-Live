import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, signInFixture } from '../fixtures';

async function signIn(page: Page, uid: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}
test.beforeAll(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'attendance-browser', 'history-viewer']) await createFixtureUser(uid);
  const token = await signInFixture('attendance-browser');
  expect((await callIdentity(token, 'register', { sessionId: 'event-one' })).status).toBe(200);
});

test('real staff check-in, member history selection, community view and correction', async ({ page, browser }) => {
  const paced = process.env.ATTENDANCE_DEMO === 'true';
  if (paced) test.setTimeout(180000);
  const clips: { role: string; stage: string; start: number; end: number }[] = [];
  const starts: Record<string, number> = { staff: Date.now() };
  async function evidence(target: Page, role: string, stage: string) {
    if (!paced) return;
    const start = (Date.now() - starts[role]) / 1000;
    await target.screenshot({ path: `test-results/pr6-${stage}.png` });
    await target.waitForTimeout(3500);
    clips.push({ role, stage, start, end: (Date.now() - starts[role]) / 1000 });
  }
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: /Participants/ }).first().click();
  await page.getByText('Verify attendance', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Attendance member', exact: true }).selectOption('attendance-browser');
  await expect(page.getByText('Attendance not verified', { exact: true }).first()).toBeVisible();
  await evidence(page, 'staff', 'registered-not-attended');
  await page.getByRole('button', { name: 'Verify member attendance', exact: true }).click();
  await expect(page.getByText('Attendance verified.', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified attended · Revision 1', { exact: true })).toBeVisible();
  await evidence(page, 'staff', 'staff-verified');

  const memberContext = await browser.newContext({ viewport: { width: 1100, height: 760 }, recordVideo: { dir: 'test-results/attendance-member', size: { width: 1100, height: 760 } } });
  const memberPage = await memberContext.newPage(); starts.member = Date.now();
  await memberPage.goto('/session/event-one'); await signIn(memberPage, 'attendance-browser');
  await expect(memberPage.getByRole('region', { name: 'Event attendance', exact: true })).toContainText('Verified attended');
  await memberPage.getByRole('region', { name: 'Event attendance', exact: true }).scrollIntoViewIfNeeded();
  await evidence(memberPage, 'member', 'current-event-status');
  await memberPage.goto('/account');
  const history = memberPage.getByRole('region', { name: 'Event history', exact: true });
  await expect(history).toContainText('Registered · Verified attended');
  await expect(history).toContainText('Event date: Unknown');
  const selection = memberPage.getByRole('checkbox', { name: 'Show Synthetic Design Workshop on profile', exact: true });
  await expect(selection).not.toBeChecked();
  await history.scrollIntoViewIfNeeded();
  await evidence(memberPage, 'member', 'private-owner-history');

  const viewerContext = await browser.newContext({ viewport: { width: 1100, height: 760 }, recordVideo: { dir: 'test-results/attendance-viewer', size: { width: 1100, height: 760 } } });
  const viewer = await viewerContext.newPage(); starts.viewer = Date.now();
  await viewer.goto('/members/attendance-browser'); await signIn(viewer, 'history-viewer');
  const sharedHistory = viewer.getByRole('region', { name: 'Event history', exact: true });
  await expect(sharedHistory).toContainText('No shared event history.');
  await sharedHistory.scrollIntoViewIfNeeded();
  await evidence(viewer, 'viewer', 'unselected-hidden');
  await selection.click(); await expect(selection).toBeChecked();
  await evidence(memberPage, 'member', 'show-on-profile-selected');
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('Registered · Verified attended');
  await expect(sharedHistory.getByText('Verification and correction history', { exact: true })).toHaveCount(0);
  await expect(sharedHistory.getByText('organizer', { exact: false })).toHaveCount(0);
  await expect(sharedHistory.getByRole('checkbox')).toHaveCount(0);
  await evidence(viewer, 'viewer', 'selected-safe-summary');

  await page.getByRole('combobox', { name: 'Attendance action', exact: true }).selectOption('correct');
  await page.getByRole('combobox', { name: 'Corrected attendance', exact: true }).selectOption('removed');
  await page.getByLabel('Correction reason', { exact: true }).fill('Synthetic wrong-person check-in');
  await page.getByLabel('Actual attendance date and time (your local timezone)', { exact: true }).fill('2025-03-04T10:00');
  await page.getByLabel('Attendance evidence', { exact: true }).fill('Synthetic desk reconciliation roster');
  await page.getByRole('button', { name: 'Save attendance correction', exact: true }).click();
  await expect(page.getByText('Attendance corrected.', { exact: true })).toBeVisible();
  await evidence(page, 'staff', 'staff-correction');
  await memberPage.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(history).toContainText('Attendance not verified');
  await history.getByText('Verification and correction history', { exact: true }).click();
  await expect(history).toContainText('Synthetic wrong-person check-in');
  await history.scrollIntoViewIfNeeded();
  await evidence(memberPage, 'member', 'owner-private-correction-audit');
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('Attendance not verified');
  await expect(sharedHistory).not.toContainText('Synthetic wrong-person check-in');
  await expect(sharedHistory).not.toContainText('Synthetic desk reconciliation roster');
  await evidence(viewer, 'viewer', 'corrected-safe-summary');
  await selection.click(); await expect(selection).not.toBeChecked();
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('No shared event history.');
  await evidence(viewer, 'viewer', 'visibility-revoked');
  if (paced) await writeFile('test-results/pr6-demo.json', JSON.stringify({ sourceRevision: process.env.ATTENDANCE_SOURCE_REVISION, mode: 'paced-real-emulator-browser', authMocks: false, securityMocks: false, syntheticData: true, nodeVersion: process.version, browserVersion: browser.version(), videos: { staff: await page.video()!.path(), member: await memberPage.video()!.path(), viewer: await viewer.video()!.path() }, clips }, null, 2));
  expect((await fixtureDb.collection('participants').where('memberId', '==', 'attendance-browser').get()).size).toBe(1);
  await memberContext.close(); await viewerContext.close();
});
