import { test, expect, type Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, signInFixture } from '../fixtures';
import { invitationRequest, publishFixture } from '../invitation-fixtures';
async function signIn(page: Page, uid: string) {
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}
test.beforeEach(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'member']) await createFixtureUser(uid);
});

test('admin deletes with retained-history copy; direct admin/display/join paths close and list hides event', async ({ page }) => {
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await expect(page.getByRole('heading', { name: 'Session Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Event records, participants, teams, awards, attendance and history are retained.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete event', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete event', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event deleted', exact: true })).toBeVisible();
  const saved = (await fixtureDb.doc('sessions/event-one').get()).data()!;
  expect(saved.deletedBy).toBe('organizer'); expect(saved.deletedAt).toBeTruthy();
  await page.goto('/admin/event-one');
  await expect(page.getByRole('heading', { name: 'Event deleted', exact: true })).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Session Settings', exact: true })).toBeVisible(); // Only event-two remains; auto-select.
  await expect(page).toHaveURL(/admin\/event-two$/);
  await page.goto('/display/event-one');
  await expect(page.getByText('Event unavailable', { exact: true })).toBeVisible();
  await page.goto('/?code=DEMO1');
  await expect(page.getByText('Session not found. Please check the code.', { exact: true })).toBeVisible();
  await page.goto('/'); await page.getByLabel('Session Code').fill('DEMO1');
  await page.getByRole('button', { name: 'Join Session', exact: true }).click();
  await expect(page.getByText('Session not found. Please check the code.', { exact: true })).toBeVisible();
});

test('already mounted participant stops live UI; public link and calendar close after deletion', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    const published = await publishFixture();
    await page.goto('/session/event-one'); await signIn(page, 'member');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Curious');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(async () => (await fixtureDb.collection('registrations').get()).size).toBe(1);
    expect((await invitationRequest('/api/identity/events/event-one/soft-delete', await signInFixture('organizer'), {})).status).toBe(200);
    await expect(page.getByRole('heading', { name: 'Event unavailable', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Event unavailable', exact: true })).toBeVisible();
    await page.goto(`/invite/${published.token}`);
    await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Add to calendar', exact: true })).toHaveCount(0);
    await expect(page.getByText('Invitation unavailable', { exact: true })).toBeVisible();
    expect((await invitationRequest(`/api/invitations/${published.token}/calendar.ics`)).status).toBe(404);
  } finally { await context.close(); }
});
