import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { clearFixtures, createFixtureUser, fixtureDb, password, seedEvents } from '../fixtures';

// Only OS share/clipboard contracts are substituted. Authentication, identity
// registration, live session reads and Firestore rules use real local emulators.
type ShareMode = 'native' | 'unavailable' | 'failed' | 'cancelled' | 'clipboard-denied';
test.use({ viewport: { width: 390, height: 844 }, video: { mode: 'on', size: { width: 390, height: 844 } } });

async function reviewerHold(page: Page) {
  if (process.env.INVITATION_DEMO === 'true') await page.waitForTimeout(3500);
}

async function signIn(page: Page, uid: string) {
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await reviewerHold(page);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toHaveCount(0);
}

async function shareMode(page: Page, mode: ShareMode) {
  await page.evaluate(mode => {
    const contract = (window as any).__invitationContract;
    contract.mode = mode; contract.shared = null; contract.copied = null;
  }, mode);
}

test.beforeAll(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['invitation-sender', 'invitation-recipient']) await createFixtureUser(uid);
  await fixtureDb.doc('sessionAccess/event-one').set({ ownerEmail: 'PRIVATE-OWNER@example.test', adminEmails: ['PRIVATE-ADMIN@example.test'], recoverySecret: 'PRIVATE-RECOVERY' });
  await fixtureDb.doc('profileDetails/invitation-sender').set({ contacts: { email: 'PRIVATE-CONTACT@example.test', phone: 'PRIVATE-PHONE' } });
});

test('mobile invitation journey and real recipient sign-in return', async ({ page, browser }) => {
  if (process.env.INVITATION_DEMO === 'true') test.setTimeout(120000);
  await page.addInitScript(() => {
    const contract = { mode: 'native', shared: null as any, copied: null as string | null };
    (window as any).__invitationContract = contract;
    Object.defineProperty(navigator, 'share', { configurable: true, get: () => contract.mode === 'unavailable' ? undefined : async (payload: ShareData) => {
      if (contract.mode === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
      if (contract.mode === 'failed' || contract.mode === 'clipboard-denied') throw new DOMException('Denied', 'NotAllowedError');
      contract.shared = { payload, active: navigator.userActivation.isActive };
    } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      if (contract.mode === 'clipboard-denied') throw new DOMException('Denied', 'NotAllowedError');
      contract.copied = text;
    } } });
  });
  await page.goto('/session/event-one');
  await signIn(page, 'invitation-sender');
  await expect(page.getByRole('heading', { name: 'Synthetic Design Workshop', exact: true })).toBeVisible();
  await reviewerHold(page);
  const shareButton = page.getByRole('button', { name: 'Share event', exact: true });
  await shareButton.click();
  await expect(page.getByRole('status')).toHaveText('Event invitation shared.');
  const shared = await page.evaluate(() => (window as any).__invitationContract.shared);
  const canonicalUrl = new URL('/session/event-one', page.url()).href;
  const invitationText = 'Join me at Synthetic Design Workshop! Come collaborate with us on #HACK Live.';
  expect(shared).toEqual({ active: true, payload: { title: 'Synthetic Design Workshop', text: invitationText, url: canonicalUrl } });
  expect(JSON.stringify(shared)).not.toMatch(/PRIVATE-|DEMO1|owner|admin|recovery|contacts|createdAt/);
  await reviewerHold(page);

  // Existing registration form and server endpoint, not another signup flow.
  await page.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Curious');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
  for (const mode of ['unavailable', 'failed'] as const) {
    await shareMode(page, mode);
    await shareButton.click();
    await expect(page.getByRole('status')).toHaveText('Event invitation copied. Paste it to invite friends.');
    const copied = await page.evaluate(() => (window as any).__invitationContract.copied);
    expect(copied).toBe(`${invitationText}\n${canonicalUrl}`);
    expect(copied.split(canonicalUrl)).toHaveLength(2);
    await reviewerHold(page);
  }
  await shareMode(page, 'clipboard-denied');
  await shareButton.click();
  await expect(page.getByRole('status')).toHaveText('Select and copy the invitation below to invite friends.');
  const manualInvitation = page.getByRole('textbox', { name: 'Event invitation', exact: true });
  await expect(manualInvitation).toHaveValue(`${invitationText}\n${canonicalUrl}`);
  await manualInvitation.focus();
  expect(await manualInvitation.evaluate((field: HTMLTextAreaElement) => field.selectionEnd - field.selectionStart)).toBe(`${invitationText}\n${canonicalUrl}`.length);
  await page.screenshot({ path: 'test-results/invitation-manual-copy.png' });
  await reviewerHold(page);
  await shareMode(page, 'cancelled');
  await shareButton.click();
  await expect(shareButton).toBeEnabled();
  await expect(page.getByRole('status')).toBeEmpty();
  await expect(manualInvitation).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__invitationContract.copied)).toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await reviewerHold(page);

  // Opening has a different render branch from the ordinary dashboard.
  await fixtureDb.doc('sessions/event-one').update({ status: 'Opening' });
  await expect(page.getByRole('heading', { name: 'Participant Onboarding' })).toBeVisible();
  await shareMode(page, 'native'); await shareButton.click();
  await expect(page.getByRole('status')).toHaveText('Event invitation shared.');
  await reviewerHold(page);
  await fixtureDb.doc('sessions/event-one').update({ status: 'Challenge Selection Open' });
  await expect(page.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();

  const recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: 'test-results/invitation-recipient', size: { width: 390, height: 844 } } });
  try {
    const recipientPage = await recipientContext.newPage();
    // The exact native-share URL, fresh storage, real Firebase email sign-in.
    await recipientPage.goto(shared.payload.url);
    await reviewerHold(recipientPage);
    await signIn(recipientPage, 'invitation-recipient');
    await expect(recipientPage).toHaveURL(canonicalUrl);
    await expect(recipientPage.getByRole('heading', { name: 'Synthetic Design Workshop', exact: true })).toBeVisible();
    await expect(recipientPage.getByText('Register as', { exact: false })).toContainText('Synthetic invitation-recipient');
    await expect(recipientPage.getByText('Last 4 Digits of Phone')).toHaveCount(0);
    await reviewerHold(recipientPage);
    await recipientPage.getByPlaceholder('e.g. Curious, Builder, Explorer').fill('Builder');
    await recipientPage.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(recipientPage.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
    await recipientPage.screenshot({ path: 'test-results/invitation-recipient-return.png' });
    await reviewerHold(recipientPage);
    await recipientPage.reload();
    await expect(recipientPage.getByText('Design a welcoming community', { exact: true }).first()).toBeVisible();
    await expect(recipientPage.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    expect((await fixtureDb.collection('participants').where('memberId', '==', 'invitation-recipient').where('sessionId', '==', 'event-one').get()).size).toBe(1);
    await reviewerHold(recipientPage);
  } finally { await recipientContext.close(); }
  if (process.env.INVITATION_DEMO === 'true') await writeFile('test-results/invitation-demo.json', JSON.stringify({ mode: 'paced-emulator-browser', shared, fullText: `${invitationText}\n${canonicalUrl}`, osContractsMocked: true, physicalDevice: false }, null, 2));
});

test('live stage and safe-title changes gate invitations without changing registration', async ({ page }) => {
  await page.goto('/session/event-one'); await signIn(page, 'invitation-sender');
  const shareButton = page.getByRole('button', { name: 'Share event', exact: true });
  await expect(shareButton).toBeVisible();
  for (const status of ['Draft', 'Closed', 'unknown-stage']) {
    await fixtureDb.doc('sessions/event-one').update({ status });
    await expect(shareButton).toHaveCount(0);
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__safeInvitation = text; } } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await fixtureDb.doc('sessions/event-one').update({ status: 'Live', title: 'PRIVATE-CONTACT@example.test' });
  await page.reload();
  await shareButton.click();
  await expect(page.getByRole('status')).toHaveText('Event invitation copied. Paste it to invite friends.');
  expect(await page.evaluate(() => (window as any).__safeInvitation)).toBe(`Join me at #HACK Live workshop! Come collaborate with us on #HACK Live.\n${new URL('/session/event-one', page.url()).href}`);
  expect((await fixtureDb.collection('participants').where('memberId', '==', 'invitation-sender').where('sessionId', '==', 'event-one').get()).size).toBe(1);
});
