import { test, expect, type Page } from '@playwright/test';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, signInFixture } from '../fixtures';

let memberParticipantId: string;
test.beforeAll(async () => {
  // Runs only inside the root's exclusive cumulative harness window.
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'award-member', 'award-peer', 'award-viewer']) await createFixtureUser(uid);
  for (const uid of ['award-member', 'award-peer']) {
    const registered = await callIdentity(await signInFixture(uid), 'register', { sessionId: 'event-one' });
    expect(registered.status).toBe(200);
    if (uid === 'award-member') memberParticipantId = registered.data.participantId;
    await fixtureDb.doc(`participants/${registered.data.participantId}`).update({ teamId: 'browser-award-team', isAssigned: true });
  }
  const savedProfile = await callIdentity(await signInFixture('award-member'), 'save-profile', { name: 'Synthetic award-member', professional: { title: 'Systems builder' }, communityFields: ['title'], contacts: { contactEmail: 'private-award-member@example.test' }, connectionFields: [] });
  expect(savedProfile.status).toBe(200);
  await fixtureDb.doc('teams/browser-award-team').set({ sessionId: 'event-one', name: 'Historical Builders', challengeId: 'event-one-challenge', hasPresented: true });
  await fixtureDb.doc('sessions/event-one').update({ status: 'Closed', date: '2025-06-01' });
});
async function signIn(page: Page, uid: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}
test('staff publish individual and team awards; member selects profile credit; later team changes preserve history; staff correct and revoke', async ({ page, browser }) => {
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: 'Official Awards', exact: true }).click();
  for (const [category, kind] of [['Contributor', 'individual'], ['Team excellence', 'team'], ['Corrected excellence', 'team']]) {
    await page.getByLabel('Category name', { exact: true }).fill(category);
    await page.getByLabel('Recipient kind', { exact: true }).selectOption(kind);
    await page.getByRole('button', { name: 'Create category', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Results updated.');
    await expect(page.getByLabel('Award category', { exact: true }).getByRole('option', { name: `${category} (${kind})`, exact: true })).toHaveCount(1);
  }
  for (const [category, kind, recipient] of [['Contributor', 'individual', memberParticipantId], ['Team excellence', 'team', 'teams~browser-award-team']]) {
    await page.getByLabel('Award category', { exact: true }).selectOption({ label: `${category} (${kind})` });
    await page.getByLabel('Award recipient', { exact: true }).selectOption(recipient);
    await page.getByRole('button', { name: 'Save draft award', exact: true }).click();
    const draft = page.getByRole('article').filter({ has: page.getByRole('heading', { name: `${category} · draft`, exact: true }) });
    await expect(draft).toBeVisible();
    await draft.getByRole('button', { name: 'Publish award', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${category} · published`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Finalize results', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen results', exact: true })).toBeVisible();
  const memberContext = await browser.newContext({ recordVideo: { dir: 'test-results/award-member', size: { width: 1100, height: 760 } } });
  const viewerContext = await browser.newContext({ recordVideo: { dir: 'test-results/award-viewer', size: { width: 1100, height: 760 } } });
  try {
    const member = await memberContext.newPage(); await member.goto('/account'); await signIn(member, 'award-member');
    await expect(member.getByLabel('Professional title or role', { exact: true })).toHaveValue('Systems builder');
    await expect(member.getByRole('heading', { name: 'Contributor', exact: true })).toBeVisible();
    await expect(member.getByRole('heading', { name: 'Team excellence', exact: true })).toBeVisible();
    await expect(member.getByLabel('Show Contributor on my profile', { exact: true })).not.toBeChecked();
    const viewer = await viewerContext.newPage(); await viewer.goto('/members/award-member'); await signIn(viewer, 'award-viewer');
    await expect(viewer.getByText('No achievements selected for this profile.', { exact: false })).toBeVisible();
    await expect(viewer.getByText('Systems builder', { exact: false })).toBeVisible();
    await expect(viewer.getByText('private-award-member@example.test', { exact: false })).toHaveCount(0);
    await member.getByLabel('Show Team excellence on my profile', { exact: true }).check();
    await expect(member.getByLabel('Show Team excellence on my profile', { exact: true })).toBeEnabled();
    await viewer.reload();
    await expect(viewer.getByRole('heading', { name: 'Team excellence', exact: true })).toBeVisible();
    await expect(viewer.getByRole('heading', { name: 'Contributor', exact: true })).toHaveCount(0);
    await viewer.goto('/results/event-one');
    await expect(viewer.getByRole('heading', { name: 'Contributor', exact: true })).toBeVisible();
    await expect(viewer.getByText('Results finalized.', { exact: false })).toBeVisible();
    // Change current membership through the real existing facilitator UI.
    await page.getByRole('button', { name: 'Collaboration', exact: true }).click();
    await page.getByRole('button', { name: 'Solution Teams', exact: true }).click();
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Synthetic award-member', exact: true }) });
    await row.getByTitle('Remove from Solution Team', { exact: true }).click();
    await expect(page.getByText('Participant removed from Solution Team.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await fixtureDb.doc(`participants/${memberParticipantId}`).get()).data()!.teamId).toBeNull();
    await member.getByRole('button', { name: 'Refresh achievements', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'Team excellence', exact: true })).toBeVisible();
    await expect(member.getByText('Historical Builders · Synthetic Design Workshop · 2025-06-01', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Official Awards', exact: true }).click();
    await page.getByLabel('Private audit reason', { exact: true }).fill('Synthetic clerical correction');
    await page.getByLabel('Correction category', { exact: true }).selectOption({ label: 'Corrected excellence (team)' });
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Team excellence · published', exact: true }) }).getByRole('button', { name: 'Correct category', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Corrected excellence · published', exact: true })).toBeVisible();
    await member.getByRole('button', { name: 'Refresh achievements', exact: true }).click();
    await expect(member.getByLabel('Show Corrected excellence on my profile', { exact: true })).toBeChecked();
    await viewer.goto('/members/award-member');
    await expect(viewer.getByRole('heading', { name: 'Corrected excellence', exact: true })).toBeVisible();
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Corrected excellence · published', exact: true }) }).getByRole('button', { name: 'Revoke award', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Corrected excellence · revoked', exact: true })).toBeVisible();
    await member.getByRole('button', { name: 'Refresh achievements', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'Corrected excellence', exact: true })).toHaveCount(0);
    await expect(member.getByRole('heading', { name: 'Contributor', exact: true })).toBeVisible();
    await viewer.reload();
    await expect(viewer.getByText('No achievements selected for this profile.', { exact: false })).toBeVisible();
    await viewer.goto('/results/event-one');
    await expect(viewer.getByRole('heading', { name: 'Corrected excellence', exact: true })).toHaveCount(0);
    await expect(viewer.getByText('Synthetic clerical correction', { exact: false })).toHaveCount(0);
    await page.getByText('Staff audit trail', { exact: true }).click();
    await expect(page.getByText('Synthetic clerical correction', { exact: false }).first()).toBeVisible();
  } finally { await memberContext.close(); await viewerContext.close(); }
});
