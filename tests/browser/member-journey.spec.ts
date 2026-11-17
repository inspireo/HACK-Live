import { readingHold, reviewRecording } from '../review-recording';
import { test, expect, Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureAuth, fixtureDb, password, seedEvents } from '../fixtures';

async function signIn(page: Page, uid: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}
test.beforeAll(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'other-browser', 'legacy-browser']) await createFixtureUser(uid);
  await fixtureDb.doc('participants/legacy-browser-row').set({ uid: 'untrusted-old-device', sessionId: 'event-one', name: 'Legacy Browser Person', adjective: 'Patient', designThinkingProficiency: 'Trained', teamId: null });
});

test('demo: signup verify return register reuse across events and devices view member delete profile', async ({ page, browser, request }) => {
  if (reviewRecording) test.setTimeout(240000);
  await page.goto('/session/event-one?from=invitation');
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await expect(page.getByText('Synthetic Design Workshop', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create an account with email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('journey@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await readingHold(page, 'verify-email');
  // Real Auth-emulator delivered code and verification operation, no mock user.
  const outbox = await (await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-hack-live/oobCodes')).json();
  const verification = outbox.oobCodes.find((entry: any) => entry.email === 'journey@example.test' && entry.requestType === 'VERIFY_EMAIL');
  expect(verification).toBeTruthy();
  const verified = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key', { data: { oobCode: verification.oobCode } });
  expect(verified.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'I have verified my email' }).click();
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  await expect(page).toHaveURL(/\/session\/event-one\?from=invitation$/);
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Journey Member');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic Design Workshop' })).toBeVisible();
  await expect(page.getByText('Last 4 Digits of Phone')).toHaveCount(0);
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Curious');
  await page.locator('select').selectOption('Trained');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await readingHold(page, 'registered-first-event');
  const journeyUser = await fixtureAuth.getUserByEmail('journey@example.test');
  const registration = (await fixtureDb.doc(`registrations/event-one~${journeyUser.uid}`).get()).data()!;
  expect(registration).toBeTruthy();
  await page.reload();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  expect((await fixtureDb.collection('participants').where('memberId', '==', journeyUser.uid).where('sessionId', '==', 'event-one').get()).size).toBe(1);
  await page.goto('/session/event-two');
  await expect(page.getByRole('heading', { name: 'Synthetic Second Workshop' })).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Curious, Builder, Explorer')).toHaveValue('Curious');
  await expect(page.locator('select')).toHaveValue('Trained');
  await expect(page.getByText('Register as', { exact: false })).toContainText('Synthetic Journey Member');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await readingHold(page, 'second-event-reuse');
  const freshContext = await browser.newContext({ recordVideo: { dir: 'test-results/fresh-device', size: { width: 1100, height: 760 } } });
  const freshPage = await freshContext.newPage();
  await freshPage.goto('/session/event-one');
  await freshPage.getByLabel('Email', { exact: true }).fill('journey@example.test');
  await freshPage.getByLabel('Password', { exact: true }).fill(password);
  await freshPage.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(freshPage.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await expect(freshPage.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  await readingHold(freshPage, 'fresh-browser-resumed');
  await freshContext.close();
  await page.goto('/members/other-browser');
  await expect(page.getByRole('heading', { name: 'Synthetic other-browser' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
  await page.goto('/account');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Journey Renamed');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await readingHold(page, 'profile-edited');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  expect((await fixtureDb.doc(`profiles/${journeyUser.uid}`).get()).data()).toEqual({ state: 'deleted' });
  expect((await fixtureAuth.getUser(journeyUser.uid)).emailVerified).toBe(true);
  expect((await fixtureDb.doc(`participants/${registration.participantId}`).get()).data()!.name).toBe('Deleted member');
});

test('organizer legacy linking and existing registration reuse', async ({ page }) => {
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: /Participants/ }).first().click();
  await page.getByText('Link a legacy registration', { exact: true }).click();
  await page.getByLabel('Legacy participant', { exact: true }).selectOption('legacy-browser-row');
  await page.getByLabel('Verified member account ID', { exact: true }).fill('legacy-browser');
  await page.getByRole('button', { name: 'Link verified member', exact: true }).click();
  await expect(page.getByText('Legacy registration linked.', { exact: true })).toBeVisible();
  await page.goto('/account'); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.goto('/session/event-one'); await signIn(page, 'legacy-browser');
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  expect((await fixtureDb.collection('participants').where('memberId', '==', 'legacy-browser').get()).size).toBe(1);
});

test('event code join, team and projector regression; deleted social profile retains admin', async ({ page }) => {
  if (reviewRecording) test.setTimeout(180000);
  await page.goto('/?code=DEMO2'); await signIn(page, 'other-browser');
  await expect(page).toHaveURL(/\/session\/event-two$/);
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Builder');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Select This Challenge', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Selection', exact: true }).click();
  await expect.poll(async () => {
    const mapping = (await fixtureDb.doc('registrations/event-two~other-browser').get()).data()!;
    return (await fixtureDb.doc(`participants/${mapping.participantId}`).get()).data()!.selectedChallengeId;
  }).toBe('event-two-challenge');
  // Only the facilitator's phase changes use the Admin SDK. All participant
  // selection, formation, finalization and naming writes run through the UI.
  await fixtureDb.doc('sessions/event-two').update({ status: 'Team Formation', minTeamSize: 1 });
  await page.getByRole('button', { name: 'Start a Solution Team', exact: true }).click();
  await page.getByRole('button', { name: /Finalize & Create Solution Team/ }).click();
  await expect(page.getByRole('heading', { name: 'Your Solution Team', exact: true })).toBeVisible();
  await fixtureDb.doc('sessions/event-two').update({ status: 'Team Naming Open' });
  await page.getByPlaceholder('Enter team name...').fill('Synthetic Browser Builders');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await fixtureDb.doc('sessions/event-two').update({ status: 'Live' });
  await expect(page.getByText('Synthetic Browser Builders', { exact: true }).first()).toBeVisible();
  await readingHold(page, 'team-named');
  await page.goto('/display/event-two');
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Account/ })).toHaveCount(0);
  await readingHold(page, 'actual-projector');
  await page.goto('/account'); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.goto('/account'); page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  await page.goto('/admin/event-one');
  await expect(page.getByRole('button', { name: /Participants/ }).first()).toBeVisible();
});

test('single and bulk publication keep attribution separate and profile deletion scrubs published views', async ({ page }) => {
  await createFixtureUser('published-author');
  await fixtureDb.doc('sessions/event-one').update({ enableChallengeDiscovery: true, status: 'Published Challenges' });
  const { callIdentity, signInFixture } = await import('../fixtures');
  const registration = await callIdentity(await signInFixture('published-author'), 'register', { sessionId: 'event-one' });
  for (const proposalId of ['single-pitch', 'bulk-pitch']) await fixtureDb.doc(`proposedChallenges/${proposalId}`).set({ uid: 'published-author', submitterParticipantId: registration.data.participantId, submitterName: 'Synthetic Published Author', submitterRealName: 'Synthetic Published Author', submitterProfileDescriptor: 'Curious', sessionId: 'event-one', title: proposalId === 'single-pitch' ? 'Single Published Challenge' : 'Bulk Published Challenge', description: 'Keep this shared workshop description', supportingContext: '', createdAt: proposalId === 'single-pitch' ? 1 : 2 });
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: 'Challenge Discovery', exact: true }).click();
  await page.getByRole('button', { name: /Proposed Challenges \(/ }).click();
  await page.getByTestId('proposal-single-pitch').getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and Publish', exact: true }).click();
  await expect.poll(async () => (await fixtureDb.collection('challenges').where('proposedChallengeId', '==', 'single-pitch').get()).size).toBe(1);
  await page.getByTestId('proposal-bulk-pitch').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publish Selected (1)', exact: true }).click();
  await expect.poll(async () => (await fixtureDb.collection('challenges').where('proposedChallengeId', '==', 'bulk-pitch').get()).size).toBe(1);
  for (const proposalId of ['single-pitch', 'bulk-pitch']) {
    const challenge = (await fixtureDb.collection('challenges').where('proposedChallengeId', '==', proposalId).get()).docs[0].data();
    expect(challenge.submitterName).toBe('Synthetic Published Author');
    expect(challenge.summary).not.toContain('Synthetic Published Author');
  }
  // Compatibility fixture for the exact generated footer in old publication.
  await fixtureDb.doc('challenges/old-generated-footer').set({ sessionId: 'event-one', proposedChallengeId: 'single-pitch', title: 'Legacy Published Challenge', summary: '<p>Keep legacy workshop content</p><p><em>Proposed by: Synthetic Published Author</em></p>', isPublished: true });
  // Organizer has no social profile after the preceding test, so use its existing
  // admin sign-out action rather than creating another social profile.
  await page.goto('/admin');
  await page.getByRole('button', { name: /Sign Out/i }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.goto('/account'); await signIn(page, 'published-author');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  await page.goto('/display/event-one');
  await expect(page.getByText('Single Published Challenge', { exact: true })).toBeVisible();
  await expect(page.getByText('Bulk Published Challenge', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Published Author', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Keep legacy workshop content', { exact: true })).toBeVisible();
});
