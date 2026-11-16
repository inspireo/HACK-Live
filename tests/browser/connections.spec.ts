import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, password, signInFixture } from '../fixtures';
import { retireSignalContact } from '../../server/retired-contacts';
import { emptyDetails } from '../../shared/profile';

const pacedDemo = process.env.CONNECTIONS_DEMO === 'true';
async function evidence(page: Page, stage: string) {
  if (!pacedDemo) return;
  await page.screenshot({ path: `test-results/connections-${stage}.png` });
  await page.waitForTimeout(3500);
}

async function signIn(page: Page, uid: string) {
  await page.goto('/connections');
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
}
test.beforeAll(async () => {
  await clearFixtures();
  for (const uid of ['connect-first', 'connect-second']) {
    await createFixtureUser(uid);
    const saved = await callIdentity(await signInFixture(uid), 'save-profile', { name: `Synthetic ${uid}`, ...emptyDetails(), contacts: { phone: uid === 'connect-first' ? '+6581234567' : '+6587654321', contactEmail: `${uid}@contact.test`, ...(uid === 'connect-first' ? { telegram: 'https://t.me/connection_demo', whatsapp: '+44 7700 900123' } : {}) }, connectionFields: uid === 'connect-first' ? ['contactEmail', 'phone', 'telegram', 'whatsapp'] : ['phone'] });
    expect(saved.status).toBe(200);
  }
});

test('two members request accept see global contact changes unfriend decline cancel and block', async ({ page, browser }) => {
  if (pacedDemo) test.setTimeout(120000);
  const secondContext = await browser.newContext({ recordVideo: { dir: 'test-results/connections-second', size: { width: 1100, height: 760 } } });
  const second = await secondContext.newPage();
  try {
    await signIn(page, 'connect-first'); await signIn(second, 'connect-second');
    await page.goto('/members/connect-second');
    await expect(page.getByRole('heading', { name: 'Synthetic connect-second', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Request connection', exact: true }).click();
    await expect(page.getByText(/You will share after acceptance: Contact email, Mobile number, Telegram username or link, WhatsApp number/)).toBeVisible();
    await evidence(page, 'request');
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.getByText('Request sent', { exact: true })).toBeVisible();
    await expect(second.getByRole('link', { name: 'Connections · 1 incoming', exact: true })).toBeVisible();
    await expect(second.getByText('Incoming connection request', { exact: true })).toBeVisible();
    await expect(second.getByText('They share after acceptance: Contact email, Mobile number, Telegram username or link, WhatsApp number.', { exact: true })).toBeVisible();
    await expect(second.getByText('+6581234567', { exact: true })).toHaveCount(0);
    await second.getByText('They share after acceptance: Contact email, Mobile number, Telegram username or link, WhatsApp number.', { exact: true }).scrollIntoViewIfNeeded();
    await expect(second.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="https://t.me/"], a[href^="https://wa.me/"]')).toHaveCount(0);
    await evidence(second, 'acceptance');
    await second.getByRole('button', { name: 'Accept connection', exact: true }).click();
    await expect(page.getByText('+6587654321', { exact: true })).toBeVisible();
    await expect(second.getByText('+6581234567', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connections · 1 accepted', exact: true })).toBeVisible();
    await second.getByText('+6581234567', { exact: true }).scrollIntoViewIfNeeded();
    await expect(second.getByRole('link', { name: '+6581234567', exact: true })).toHaveAttribute('href', 'tel:+6581234567');
    await expect(second.getByRole('link', { name: 'connect-first@contact.test', exact: true })).toHaveAttribute('href', 'mailto:connect-first@contact.test');
    await expect(second.getByRole('link', { name: '@connection_demo', exact: true })).toHaveAttribute('href', 'https://t.me/connection_demo');
    await expect(second.getByRole('link', { name: '+447700900123', exact: true })).toHaveAttribute('href', 'https://wa.me/447700900123');
    // Inspect/focus real actions without opening an app or sending a message.
    await second.getByRole('link', { name: '@connection_demo', exact: true }).focus();
    await evidence(second, 'approved');
    await page.getByRole('button', { name: 'Mark acceptance read', exact: true }).click();
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    await page.getByLabel('Share Mobile number with all approved connections', { exact: true }).uncheck();
    await page.getByLabel('Share Telegram username or link with all approved connections', { exact: true }).uncheck();
    await page.getByLabel('Share WhatsApp number with all approved connections', { exact: true }).uncheck();
    await page.getByLabel('Share Contact email with all approved connections', { exact: true }).check();
    if (pacedDemo) {
      const sharing = page.getByRole('group', { name: 'Contact details and sharing', exact: true });
      await sharing.screenshot({ path: 'test-results/connections-global-selection.png' });
      await page.waitForTimeout(3500);
    }
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await expect(second.getByText('connect-first@contact.test', { exact: true })).toBeVisible();
    await expect(second.getByText('+6581234567', { exact: true })).toHaveCount(0);
    await second.getByText('connect-first@contact.test', { exact: true }).scrollIntoViewIfNeeded();
    await evidence(second, 'updated');
    await page.goto('/members/connect-second');
    await expect(page.getByText('+6587654321', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Unfriend', exact: true }).click();
    await expect(page.getByText('+6587654321', { exact: true })).toHaveCount(0);
    await expect(second.getByText('connect-first@contact.test', { exact: true })).toHaveCount(0);
    await page.getByText('Not connected', { exact: true }).scrollIntoViewIfNeeded();
    await evidence(page, 'unfriended');
    await page.getByRole('button', { name: 'Request connection', exact: true }).click();
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await second.getByRole('button', { name: 'Decline request', exact: true }).click();
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
    await evidence(page, 'declined');
    await page.getByRole('button', { name: 'Request connection', exact: true }).click();
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
    await evidence(page, 'cancelled');
    await page.getByRole('button', { name: 'Request connection', exact: true }).click();
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await second.getByRole('button', { name: 'Block member', exact: true }).click();
    // Incoming row disappears; blocked member's profile also has no request button.
    await second.goto('/members/connect-first');
    await expect(second.getByText('Connection unavailable', { exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Request connection', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Connection unavailable', { exact: true })).toBeVisible();
    await evidence(second, 'blocked');
    expect((await fixtureDb.doc('connectionContacts/connect-first').get()).data()).toEqual({ contactEmail: 'connect-first@contact.test' });
    if (pacedDemo) await writeFile('test-results/connections-demo.json', JSON.stringify({ mode: 'paced-real-emulator-browser', securityMocks: false, physicalDevice: false, projectId: 'demo-hack-live', accounts: ['connect-first', 'connect-second'], selectionChange: 'real-profile-editor-ui', stages: ['request', 'acceptance', 'approved', 'global-selection', 'updated', 'unfriended', 'decline', 'cancel', 'blocked'], limitations: 'Synthetic Chromium/Auth/Firestore emulators; no production, physical-device or Google-consent claim. No fabricated or retimed frames.' }, null, 2));
  } finally { await secondContext.close(); }
});


test('legacy Signal denies an accepted snapshot until cleanup; invalid legacy routes stay text and revocation removes actions', async ({ page }) => {
  const owner = 'contact-link-owner', peer = 'contact-link-peer';
  for (const uid of [owner, peer]) await createFixtureUser(uid);
  const ownerToken = await signInFixture(owner), peerToken = await signInFixture(peer);
  const payload = { name: 'Contact routes owner', ...emptyDetails(), contacts: { contactEmail: 'routes@contact.test', phone: '+65 8123 4567', telegram: 't.me/routes_demo', whatsapp: '+44 7700 900123' }, connectionFields: ['contactEmail', 'phone', 'telegram', 'whatsapp'] };
  expect((await callIdentity(ownerToken, 'save-profile', payload)).status).toBe(200);
  const requested = await callIdentity(ownerToken, 'connections/request', { peerUid: peer });
  const outbound: string[] = [];
  page.on('request', request => { if (/^https?:\/\/(?:t\.me|wa\.me)\//.test(request.url())) outbound.push(request.url()); });
  await signIn(page, peer);
  await page.goto(`/members/${owner}`);
  await expect(page.getByText('Incoming connection request', { exact: true })).toBeVisible();
  const actionLinks = page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="https://t.me/"], a[href^="https://wa.me/"]');
  await expect(actionLinks).toHaveCount(0);
  expect((await callIdentity(peerToken, 'connections/accept', { peerUid: owner, generation: requested.data.generation })).status).toBe(200);
  await expect(actionLinks).toHaveCount(4);
  const reference = fixtureDb.doc(`connectionContacts/${owner}`);
  await reference.update({ signal: 'RETIRED-MUST-NOT-RENDER' });
  await expect(actionLinks).toHaveCount(0);
  await expect(page.getByText('No contact fields shared.', { exact: true })).toBeVisible();
  await expect(page.getByText('RETIRED-MUST-NOT-RENDER', { exact: true })).toHaveCount(0);
  expect(await retireSignalContact(fixtureDb, owner)).toBe('candidate');
  expect((await reference.get()).data()!.signal).toBe('RETIRED-MUST-NOT-RENDER');
  expect(await retireSignalContact(fixtureDb, owner, true)).toBe('retired');
  await page.reload(); await expect(actionLinks).toHaveCount(4);
  await reference.set({ phone: '555-local', telegram: 'https://evil.test/route', whatsapp: '+6581234567?text=secret', contactEmail: 'member@contact.test?bcc=secret' });
  await expect(page.getByText('555-local', { exact: true })).toBeVisible();
  await expect(actionLinks).toHaveCount(0);
  await expect(page.getByText('Ask this member to correct this contact in their profile.', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'https://evil.test/route', exact: true })).toHaveCount(0);
  expect((await callIdentity(ownerToken, 'save-profile', payload)).status).toBe(200);
  await expect(actionLinks).toHaveCount(4);
  await page.getByRole('button', { name: 'Unfriend', exact: true }).click();
  await expect(actionLinks).toHaveCount(0);
  expect(outbound).toEqual([]);
});
