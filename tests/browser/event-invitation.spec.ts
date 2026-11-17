import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, signInFixture } from '../fixtures';
import { invitationRequest, publicFields, publishFixture } from '../invitation-fixtures';

test.use({ viewport: { width: 1100, height: 900 }, video: { mode: 'on', size: { width: 1100, height: 900 } } });
const hold = async (page: Page) => { if (process.env.INVITATION_DEMO === 'true') await page.waitForTimeout(2800); };
async function signIn(page: Page, uid: string) {
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await hold(page); await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}
async function shareMode(page: Page, mode: string) { await page.evaluate(value => { (window as any).__invitationContract.mode = value; (window as any).__invitationContract.copied = null; }, mode); }
async function installShareContract(page: Page) {
  await page.addInitScript(() => {
    const contract = { mode: 'native', shared: null as any, copied: null as string | null };
    (window as any).__invitationContract = contract;
    Object.defineProperty(navigator, 'share', { configurable: true, get: () => contract.mode === 'unavailable' ? undefined : async (payload: ShareData) => {
      if (contract.mode === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
      if (contract.mode === 'failed' || contract.mode === 'clipboard-denied') throw new DOMException('Denied', 'NotAllowedError');
      contract.shared = { payload, active: navigator.userActivation.isActive };
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      if (contract.mode === 'clipboard-denied') throw new DOMException('Denied', 'NotAllowedError'); contract.copied = text;
    } } });
  });
}
test.beforeEach(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'invitation-sender', 'invitation-recipient']) await createFixtureUser(uid);
  await fixtureDb.doc('sessionAccess/event-one').set({ ownerEmail: 'PRIVATE-OWNER@example.test', adminEmails: ['PRIVATE-ADMIN@example.test'] });
  await fixtureDb.doc('profileDetails/invitation-sender').set({ contacts: { email: 'PRIVATE-CONTACT@example.test', phone: 'PRIVATE-PHONE' } });
});

test('organizer publication and sender native copy manual cancellation', async ({ page }) => {
  if (process.env.INVITATION_DEMO === 'true') test.setTimeout(150000);
  await installShareContract(page);
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: 'Public invitation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Public event invitation' })).toBeVisible();
  await expect(page.getByLabel('Registration required', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Add to calendar', { exact: true })).not.toBeChecked();
  for (const [label, value] of [['Public event title', publicFields.title], ['Public description', publicFields.description], ['Public venue', publicFields.venue], ['Public viewing URL', publicFields.viewingUrl], ['Event starts', publicFields.startLocal], ['Event ends', publicFields.endLocal], ['Event timezone (IANA)', publicFields.timeZone]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Add to calendar', { exact: true }).check(); await hold(page);
  await page.getByRole('button', { name: 'Publish event details', exact: true }).click();
  await expect(page.getByText('Published · current invitation active', { exact: false })).toBeVisible();
  await hold(page); await page.reload();
  await page.getByRole('button', { name: 'Public invitation', exact: true }).click();
  await expect(page.getByLabel('Event timezone (IANA)', { exact: true })).toHaveValue('Asia/Singapore');
  const publication = (await fixtureDb.doc('eventPublications/event-one').get()).data()!;
  const record = (await fixtureDb.doc(`eventInvitations/${publication.currentToken}`).get()).data()!;
  const share = page.getByRole('button', { name: 'Share event', exact: true });
  await expect(share).toBeEnabled(); await share.click();
  await expect(page.getByText('Event invitation shared.', { exact: true })).toBeVisible();
  const shared = await page.evaluate(() => (window as any).__invitationContract.shared);
  expect(shared.active).toBe(true); expect(shared.payload.url).toBe(new URL(`/invite/${publication.currentToken}`, page.url()).href);
  expect(shared.payload.title).toBe(publicFields.title); expect(shared.payload.text).toContain('3 Dec 2026, 09:30 (Asia/Singapore)');
  expect(JSON.stringify(shared)).not.toMatch(/PRIVATE-|DEMO1|event-one|owner|admin|recovery|contacts|createdAt/);
  await hold(page);
  for (const mode of ['unavailable', 'failed']) {
    await shareMode(page, mode); await share.click();
    await expect(page.getByText('Event invitation copied. Paste it to invite friends.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__invitationContract.copied)).toBe(`${shared.payload.text}\n${shared.payload.url}`);
    await hold(page);
  }
  await shareMode(page, 'clipboard-denied'); await share.click();
  const manual = page.getByRole('textbox', { name: 'Event invitation', exact: true });
  await expect(manual).toHaveValue(`${shared.payload.text}\n${shared.payload.url}`);
  await manual.scrollIntoViewIfNeeded();
  await manual.focus(); expect(await manual.evaluate((field: HTMLTextAreaElement) => field.selectionEnd - field.selectionStart)).toBe((await manual.inputValue()).length);
  await page.screenshot({ path: 'test-results/invitation-manual-copy.png' }); await hold(page);
  await shareMode(page, 'cancelled'); await share.click();
  await expect(manual).toHaveCount(0); expect(await page.evaluate(() => (window as any).__invitationContract.copied)).toBeNull();
  await expect(share).toBeEnabled();
  expect((await fixtureDb.doc(`eventInvitations/${publication.currentToken}`).get()).data()).toEqual(record);
  expect((await fixtureDb.collection('registrations').get()).size).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Delete event', exact: true }).click();
  await hold(page);
  await page.getByRole('button', { name: 'Confirm delete event', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event deleted', exact: true })).toBeVisible();
  expect((await fixtureDb.doc('sessions/event-one').get()).data()!.deletedAt).toBeTruthy();
  expect((await fixtureDb.doc('eventPublications/event-one').get()).exists).toBe(true);
  for (const suffix of ['', '/calendar.ics']) expect((await invitationRequest(`/api/invitations/${publication.currentToken}${suffix}`)).status).toBe(404);
  await page.screenshot({ path: 'test-results/invitation-soft-deleted.png' }); await hold(page);
  if (process.env.INVITATION_DEMO === 'true') await writeFile('test-results/invitation-demo.json', JSON.stringify({ mode: 'paced-emulator-browser', shared, osContractsMocked: true, physicalDevice: false, actualApp: true, softDeletionShown: true, fixtures: 'synthetic' }, null, 2));
});

test('anonymous recipient calendar preview then real auth profile and explicit registration', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3000', viewport: { width: 390, height: 844 }, recordVideo: { dir: 'test-results/invitation-recipient', size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  try {
  if (process.env.INVITATION_DEMO === 'true') test.setTimeout(150000);
  const publication = await publishFixture();
  await fixtureDb.doc('profiles/invitation-recipient').delete();
  const privateReads: string[] = [];
  page.on('request', request => { if (/firestore.*Listen|\/api\/identity\//.test(request.url())) privateReads.push(request.url()); });
  await page.goto(`/invite/${publication.token}`);
  await expect(page.getByRole('heading', { name: publicFields.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add to calendar', exact: true })).toBeVisible();
  await expect(page.getByText(publicFields.venue, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open viewing link', exact: true })).toHaveAttribute('href', publicFields.viewingUrl);
  await expect(page.getByText('Design a welcoming community', { exact: true })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/PRIVATE-|DEMO1|Synthetic invitation|ownerEmail/);
  expect(privateReads).toEqual([]);
  await page.screenshot({ path: 'test-results/invitation-public-preview.png' });
  await hold(page);
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Add to calendar', exact: true }).click();
  const calendar = await download; expect(calendar.suggestedFilename()).toBe('event.ics');
  const stream = await calendar.createReadStream(); let content = ''; for await (const chunk of stream!) content += chunk;
  expect(content).toContain('DTSTART:20261203T013000Z');
  expect((await fixtureDb.collection('registrations').get()).size).toBe(0); await hold(page);
  await page.getByRole('link', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invite/${publication.token}/register$`));
  await signIn(page, 'invitation-recipient');
  await expect(page.getByRole('heading', { name: 'Create your profile', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Jamie · Community Builder'); await hold(page);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page).toHaveURL(/\/session\/event-one$/);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  expect((await fixtureDb.collection('registrations').get()).size).toBe(0);
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Curious'); await hold(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await hold(page); await page.reload();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  expect((await fixtureDb.collection('registrations').where('sessionId', '==', 'event-one').where('uid', '==', 'invitation-recipient').get()).size).toBe(1);
  await page.screenshot({ path: 'test-results/invitation-recipient-return.png' }); await hold(page);
  } finally { await context.close(); }
});

test('all CTA modes and post-auth revocation fail closed without accidental registration', async ({ page }) => {
  const owner = await signInFixture('organizer');
  const registerOnly = await publishFixture('event-one', { title: 'Register-only workshop', registrationRequired: true });
  await page.goto(`/invite/${registerOnly.token}`);
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add to calendar', exact: true })).toHaveCount(0);
  const calendarOnly = await publishFixture('event-one', { ...publicFields, registrationRequired: false });
  await page.reload();
  await expect(page.getByText('No account or registration needed to attend.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add to calendar', exact: true })).toBeVisible();
  expect(calendarOnly.token).toBe(registerOnly.token);
  await page.screenshot({ path: 'test-results/invitation-calendar-only.png' });
  const required = await publishFixture();
  await page.reload(); await page.getByRole('link', { name: 'Register', exact: true }).click();
  await invitationRequest('/api/identity/events/event-one/publication/revoke', owner, { revision: required.revision });
  await signIn(page, 'invitation-recipient');
  await expect(page.getByRole('alert')).toContainText('Invitation unavailable');
  expect((await fixtureDb.collection('registrations').get()).size).toBe(0);
  await page.goto(`/invite/${required.token}`); await expect(page.getByRole('heading', { name: 'Invitation unavailable', exact: true })).toBeVisible();
});

test('expired invitations fail before and after auth without replacing registrations', async ({ page }) => {
  const publication = await publishFixture();
  await page.goto(`/invite/${publication.token}`);
  await page.getByRole('link', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  const expiresAt = Date.now() - 1000;
  await fixtureDb.doc(`eventInvitations/${publication.token}`).update({ createdAt: expiresAt - 604800000, expiresAt });
  await signIn(page, 'invitation-recipient');
  await expect(page.getByRole('alert')).toContainText('Invitation unavailable');
  expect((await fixtureDb.collection('registrations').get()).size).toBe(0);
  await page.goto(`/invite/${publication.token}`);
  await expect(page.getByRole('heading', { name: 'Invitation unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add to calendar', exact: true })).toHaveCount(0);
  await page.goto('/session/event-one');
  await expect(page.getByRole('button', { name: 'Share event', exact: true })).toBeDisabled();
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Builder');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  expect((await fixtureDb.collection('registrations').get()).size).toBe(1);
});

test('organizer renewal revocation unpublish controls and legacy unpublished registration', async ({ page }) => {
  const publication = await publishFixture();
  await page.goto('/admin/event-one'); await signIn(page, 'organizer');
  await page.getByRole('button', { name: 'Public invitation', exact: true }).click();
  await page.getByRole('button', { name: 'Renew invitation', exact: true }).click();
  await expect(page.getByText('New seven-day invitation created. Previous link revoked.', { exact: true })).toBeVisible();
  expect((await invitationRequest(`/api/invitations/${publication.token}`)).status).toBe(404);
  const renewed = (await fixtureDb.doc('eventPublications/event-one').get()).data()!;
  await page.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
  await expect(page.getByText('Invitation revoked. Renew to share again.', { exact: true })).toBeVisible();
  expect((await invitationRequest(`/api/invitations/${renewed.currentToken}`)).status).toBe(404);
  await page.getByRole('button', { name: 'Unpublish details', exact: true }).click();
  await expect(page.getByText('Unpublished · no public invitation', { exact: true })).toBeVisible();
  await page.goto('/session/event-two');
  await expect(page.getByRole('heading', { name: 'Synthetic Second Workshop', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share event', exact: true })).toBeDisabled();
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Builder');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  expect((await fixtureDb.collection('registrations').where('sessionId', '==', 'event-two').get()).size).toBe(1);
});
