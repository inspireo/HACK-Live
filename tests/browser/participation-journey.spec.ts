import { test, expect, Page } from '@playwright/test';
import jsQR from 'jsqr';
import { writeFile } from 'node:fs/promises';
import { emptyDetails } from '../../shared/profile';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, signInFixture } from '../fixtures';

const pacedDemo = process.env.PARTICIPATION_DEMO === 'true';
async function evidence(page: Page, stage: string) {
  if (!pacedDemo) return;
  await page.screenshot({ path: `test-results/pr5-${stage}.png`, fullPage: false });
  await page.waitForTimeout(3500);
}

async function signIn(page: Page, uid: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}

test.beforeAll(async () => {
  await clearFixtures(); await seedEvents();
  await createFixtureUser('organizer'); await createFixtureUser('badge-browser');
  const saved = await callIdentity(await signInFixture('badge-browser'), 'save-profile', { name: 'Alex Morgan', ...emptyDetails(), professional: { title: 'Software architect', bio: 'PRIVATE-BADGE-BIO' }, communityFields: ['title'], contacts: { phone: 'PRIVATE-BADGE-CONTACT' } });
  expect(saved.status).toBe(200);
  await fixtureDb.doc('resources/mentor-handbook').set({ sessionId: 'event-one', title: 'Mentor handbook', summary: '<p>Support members without joining a solution team.</p>', category: 'Guide', isPublished: true });
});

test('staff issues roles → mobile member badge → decoded profile destination survives real sign-in → revoke/delete', async ({ page, browser }) => {
  if (pacedDemo) test.setTimeout(180000);
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: 'Participants Roster' }).click();
  await page.locator('summary').filter({ hasText: 'Official event roles' }).click();
  await page.getByLabel('Registered member account ID').fill('badge-browser');
  await page.getByRole('checkbox', { name: 'participant', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'mentor', exact: true }).check();
  await page.getByRole('checkbox', { name: 'volunteer', exact: true }).check();
  await page.getByRole('button', { name: 'Save official event roles', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Official event roles saved.' })).toBeVisible();
  await evidence(page, 'staff-assignment');
  const registration = (await fixtureDb.doc('registrations/event-one~badge-browser').get()).data()!;
  expect(registration.participantId).toBeTruthy();
  expect((await fixtureDb.doc(`participants/${registration.participantId}`).get()).data()!.teamId).toBeNull();

  const mobile = await browser.newContext({ viewport: { width: 320, height: 740 }, recordVideo: { dir: 'test-results/pr5-mobile', size: { width: 320, height: 740 } } });
  // Only the share adapter is mocked. Auth, role issuance, registration pointer,
  // profile destination, badge rendering and QR pixels are real browser/emulators.
  await mobile.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as any).__sharedProfile = data; } }));
  const member = await mobile.newPage();
  try {
    await fixtureDb.doc('sessions/event-one').update({ status: 'Opening' });
    await member.goto('/session/event-one'); await signIn(member, 'badge-browser');
    await expect(member.getByRole('heading', { name: 'Participant Onboarding', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: 'Start a Solution Team', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: 'Share event', exact: true })).toBeVisible();
    await expect(member.getByRole('heading', { name: 'Mentor handbook', exact: true })).toBeVisible();
    await member.getByRole('button', { name: /View Details/ }).click();
    await expect(member.getByRole('dialog', { name: 'Resource details' })).toContainText('Support members without joining a solution team.');
    await member.getByRole('button', { name: 'Close resource details', exact: true }).click();
    await member.getByRole('button', { name: 'Share event', exact: true }).click();
    expect((await member.evaluate(() => (window as any).__sharedProfile)).url).toBe('http://127.0.0.1:3000/session/event-one');
    await evidence(member, 'staff-resources');
    await member.getByRole('link', { name: 'My badge', exact: true }).click();
    await expect(member.getByRole('article', { name: 'Personal event badge' })).toBeVisible();
    await expect(member.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();
    const badge = member.getByRole('article', { name: 'Personal event badge' });
    await expect(badge.getByText('mentor', { exact: true })).toBeVisible();
    await expect(badge.getByText('volunteer', { exact: true })).toBeVisible();
    await expect(badge.getByText('participant', { exact: true })).toHaveCount(0);
    await expect(badge.getByText('Software architect', { exact: true })).toBeVisible();
    await expect(member.getByText('PRIVATE-BADGE-CONTACT', { exact: true })).toHaveCount(0);
    await expect(member.getByText('PRIVATE-BADGE-BIO', { exact: true })).toHaveCount(0);
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await member.screenshot({ path: 'test-results/pr5-mobile/badge-320.png', fullPage: true });
    await evidence(member, 'badge-320');
    // Decode the actually rendered qrcode.react SVG, rasterized in the browser.
    const pixels = await member.locator('svg').evaluate(async element => {
      const markup = new XMLSerializer().serializeToString(element);
      const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 600;
      const drawing = canvas.getContext('2d')!; drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, 600, 600); drawing.drawImage(image, 0, 0, 600, 600);
      return Array.from(drawing.getImageData(0, 0, 600, 600).data);
    });
    const decoded = jsQR(new Uint8ClampedArray(pixels), 600, 600);
    expect(decoded?.data).toBe('http://127.0.0.1:3000/members/badge-browser');
    await member.getByRole('button', { name: 'Share profile', exact: true }).click();
    expect(await member.evaluate(() => (window as any).__sharedProfile)).toEqual({ title: 'My #hack member profile', url: decoded!.data });
    // Force clipboard failure to exercise the selectable-link fallback.
    await member.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard unavailable'); } } }));
    await member.getByRole('button', { name: 'Copy profile link' }).click();
    await expect(member.getByRole('status')).toHaveText('Copy the profile link below.');
    await expect(member.getByRole('link', { name: decoded!.data, exact: true })).toHaveAttribute('href', decoded!.data);

    // Another event reuses the SAME member/profile with a separate pointer.
    await page.goto('/admin/event-two');
    await page.getByRole('button', { name: 'Participants Roster' }).click();
    await page.locator('summary').filter({ hasText: 'Official event roles' }).click();
    await page.getByLabel('Registered member account ID').fill('badge-browser');
    await page.getByRole('checkbox', { name: 'participant', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'judge', exact: true }).check();
    await page.getByRole('button', { name: 'Save official event roles', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Official event roles saved.' })).toBeVisible();
    await expect(member.getByLabel('Event', { exact: true })).toBeVisible();
    await member.getByLabel('Event', { exact: true }).selectOption('event-two');
    await expect(badge.getByText('judge', { exact: true })).toBeVisible();
    await expect(badge.getByText('mentor', { exact: true })).toHaveCount(0);
    await expect(member).toHaveURL(/\/badge\?event=event-two$/);
    await evidence(member, 'event-selector');

    const viewerContext = await browser.newContext();
    const viewer = await viewerContext.newPage();
    try {
      await viewer.goto(`${decoded!.data}?scan=badge`);
      await expect(viewer.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
      await expect(viewer).toHaveURL(`${decoded!.data}?scan=badge`);
      await evidence(viewer, 'profile-signin-destination');
      await signIn(viewer, 'organizer');
      await expect(viewer).toHaveURL(`${decoded!.data}?scan=badge`);
      await expect(viewer.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();
      await expect(viewer.getByText('Community member', { exact: true })).toBeVisible();
      await expect(viewer.getByRole('button', { name: 'Request connection', exact: true })).toBeVisible();
      await expect(viewer.getByText('PRIVATE-BADGE-CONTACT', { exact: true })).toHaveCount(0);
      await evidence(viewer, 'member-visible-profile');
      // Viewing the stable profile is read-only; participation remains staff-only.
      expect((await fixtureDb.doc(`participants/${registration.participantId}`).get()).data()!.officialRoles).toEqual(['mentor', 'volunteer']);
      expect((await fixtureDb.doc(`participants/${registration.participantId}`).get()).data()!.teamId).toBeNull();
    } finally { await viewerContext.close(); }

    // Live invalidation: an inactive participation can no longer show its badge.
    const second = (await fixtureDb.doc('registrations/event-two~badge-browser').get()).data()!;
    await fixtureDb.doc(`participants/${second.participantId}`).update({ participationState: 'inactive' });
    await expect(badge.getByText('judge', { exact: true })).toHaveCount(0);
    await expect(badge.getByText('mentor', { exact: true })).toBeVisible();
    await fixtureDb.doc(`participants/${registration.participantId}`).update({ participationState: 'inactive' });
    await expect(member.getByRole('article', { name: 'Personal event badge' })).toHaveCount(0);
    await expect(member.getByText('No active event badge. Register for an event or contact its organizer.')).toBeVisible();
    await evidence(member, 'badge-revoked');
    await member.getByRole('link', { name: 'Account', exact: true }).click();
    member.once('dialog', dialog => dialog.accept());
    await member.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
    expect((await fixtureDb.doc(`participants/${registration.participantId}`).get()).data()!.officialRoles).toBeUndefined();
    if (pacedDemo) await writeFile('test-results/pr5-demo.json', JSON.stringify({ mode: 'paced-real-emulator-browser', securityMocks: false, physicalDevice: false, shareAndClipboardAdaptersMocked: true, viewport: { width: 320, height: 740 }, qrDecoded: decoded!.data, sourceRevision: process.env.PARTICIPATION_SOURCE_REVISION, parentHead: '37fca8cc9907add4ce39227535b4b49f2325757b', nodeVersion: process.version, browserVersion: browser.version(), journey: 'staff-role-issue/resources/badge/selector/profile-signin/revocation/deletion' }, null, 2));
  } finally { await mobile.close(); }
});

test('mixed participant mentor forms a real solution team and retains leadership and team label through finalization', async ({ page }) => {
  if (pacedDemo) test.setTimeout(120000);
  await createFixtureUser('mixed-browser');
  const assigned = await callIdentity(await signInFixture('organizer'), 'event-roles', { sessionId: 'event-two', memberUid: 'mixed-browser', roles: ['participant', 'mentor'] });
  expect(assigned.status).toBe(200);
  await fixtureDb.doc('sessions/event-two').update({ status: 'Challenge Selection Open' });
  await page.goto('/session/event-two'); await signIn(page, 'mixed-browser');
  await expect(page.getByRole('button', { name: 'Share event', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select This Challenge', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Selection', exact: true }).click();
  await expect.poll(async () => (await fixtureDb.doc(`participants/${assigned.data.participantId}`).get()).data()!.selectedChallengeId).toBe('event-two-challenge');
  await fixtureDb.doc('sessions/event-two').update({ status: 'Team Formation', minTeamSize: 1 });
  await page.getByRole('button', { name: 'Start a Solution Team', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Window', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Team role labels' }).click();
  await page.getByRole('combobox', { name: 'Team member', exact: true }).selectOption(assigned.data.participantId);
  await page.getByRole('combobox', { name: 'Team role label', exact: true }).selectOption('designer');
  await page.getByRole('button', { name: 'Save team role label', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Team role label saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'View Forming Solution Team', exact: true }).click();
  await page.getByRole('button', { name: /Finalize & Create Solution Team/ }).click();
  await expect(page.getByRole('heading', { name: 'Your Solution Team', exact: true })).toBeVisible();
  const participant = (await fixtureDb.doc(`participants/${assigned.data.participantId}`).get()).data()!;
  expect((await fixtureDb.doc(`teams/${participant.teamId}`).get()).data()!.leaderId).toBe(assigned.data.participantId);
  expect(participant.teamRoleLabels[`teams~${participant.teamId}`]).toBe('designer');
  await page.getByRole('link', { name: 'My badge', exact: true }).click();
  const badge = page.getByRole('article', { name: 'Personal event badge' });
  await expect(badge.getByText('participant', { exact: true })).toBeVisible();
  await expect(badge.getByText('mentor', { exact: true })).toBeVisible();
  await expect(badge.getByText('Team role: designer', { exact: true })).toBeVisible();
  await evidence(page, 'mixed-participant-team-label');
});
