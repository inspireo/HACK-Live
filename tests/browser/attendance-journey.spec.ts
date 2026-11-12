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
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: /Participants/ }).first().click();
  await page.getByText('Verify attendance', { exact: true }).click();
  await page.getByLabel('Attendance member', { exact: true }).selectOption('attendance-browser');
  await expect(page.getByText('Attendance not verified', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Verify member attendance', exact: true }).click();
  await expect(page.getByText('Attendance verified.', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified attended · Revision 1', { exact: true })).toBeVisible();

  const memberContext = await browser.newContext({ recordVideo: { dir: 'test-results/attendance-member', size: { width: 1100, height: 760 } } });
  const memberPage = await memberContext.newPage();
  await memberPage.goto('/session/event-one'); await signIn(memberPage, 'attendance-browser');
  await expect(memberPage.getByRole('region', { name: 'Event attendance', exact: true })).toContainText('Verified attended');
  await memberPage.goto('/account');
  const history = memberPage.getByRole('region', { name: 'Event history', exact: true });
  await expect(history).toContainText('Registered · Verified attended');
  await expect(history).toContainText('Event date: Unknown');
  const selection = memberPage.getByRole('checkbox', { name: 'Show Synthetic Design Workshop on profile', exact: true });
  await expect(selection).not.toBeChecked();

  const viewerContext = await browser.newContext({ recordVideo: { dir: 'test-results/attendance-viewer', size: { width: 1100, height: 760 } } });
  const viewer = await viewerContext.newPage();
  await viewer.goto('/members/attendance-browser'); await signIn(viewer, 'history-viewer');
  const sharedHistory = viewer.getByRole('region', { name: 'Event history', exact: true });
  await expect(sharedHistory).toContainText('No shared event history.');
  await selection.check(); await expect(selection).toBeChecked();
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('Registered · Verified attended');
  await expect(sharedHistory.getByText('Verification and correction history', { exact: true })).toHaveCount(0);
  await expect(sharedHistory.getByText('organizer', { exact: false })).toHaveCount(0);
  await expect(sharedHistory.getByRole('checkbox')).toHaveCount(0);

  await page.getByLabel('Attendance action', { exact: true }).selectOption('correct');
  await page.getByLabel('Corrected attendance', { exact: true }).selectOption('removed');
  await page.getByLabel('Correction reason', { exact: true }).fill('Synthetic wrong-person check-in');
  await page.getByLabel('Actual attendance date and time (your local timezone)', { exact: true }).fill('2025-03-04T10:00');
  await page.getByLabel('Attendance evidence', { exact: true }).fill('Synthetic desk reconciliation roster');
  await page.getByRole('button', { name: 'Save attendance correction', exact: true }).click();
  await expect(page.getByText('Attendance corrected.', { exact: true })).toBeVisible();
  await memberPage.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(history).toContainText('Attendance not verified');
  await history.getByText('Verification and correction history', { exact: true }).click();
  await expect(history).toContainText('Synthetic wrong-person check-in');
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('Attendance not verified');
  await expect(sharedHistory).not.toContainText('Synthetic wrong-person check-in');
  await expect(sharedHistory).not.toContainText('Synthetic desk reconciliation roster');
  await selection.uncheck(); await expect(selection).not.toBeChecked();
  await viewer.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await expect(sharedHistory).toContainText('No shared event history.');
  expect((await fixtureDb.collection('participants').where('memberId', '==', 'attendance-browser').get()).size).toBe(1);
  await memberContext.close(); await viewerContext.close();
});
