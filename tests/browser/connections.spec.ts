import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, password, signInFixture } from '../fixtures';
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
    const saved = await callIdentity(await signInFixture(uid), 'save-profile', { name: `Synthetic ${uid}`, ...emptyDetails(), contacts: { phone: uid === 'connect-first' ? '555-0101' : '555-0102', contactEmail: `${uid}@contact.test` }, connectionFields: ['phone'] });
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
    await expect(page.getByText(/You will share after acceptance: Phone/)).toBeVisible();
    await evidence(page, 'request');
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.getByText('Request sent', { exact: true })).toBeVisible();
    await expect(second.getByRole('link', { name: 'Connections · 1 incoming', exact: true })).toBeVisible();
    await expect(second.getByText('Incoming connection request', { exact: true })).toBeVisible();
    await expect(second.getByText('They share after acceptance: Phone.', { exact: true })).toBeVisible();
    await expect(second.getByText('555-0101', { exact: true })).toHaveCount(0);
    await second.getByText('They share after acceptance: Phone.', { exact: true }).scrollIntoViewIfNeeded();
    await evidence(second, 'acceptance');
    await second.getByRole('button', { name: 'Accept connection', exact: true }).click();
    await expect(page.getByText('555-0102', { exact: true })).toBeVisible();
    await expect(second.getByText('555-0101', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connections · 1 accepted', exact: true })).toBeVisible();
    await second.getByText('555-0101', { exact: true }).scrollIntoViewIfNeeded();
    await evidence(second, 'approved');
    await page.getByRole('button', { name: 'Mark acceptance read', exact: true }).click();
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    await page.getByLabel('Share Phone with all approved connections', { exact: true }).uncheck();
    await page.getByLabel('Share Contact email with all approved connections', { exact: true }).check();
    if (pacedDemo) {
      const sharing = page.getByRole('group', { name: 'Contact details and sharing', exact: true });
      await sharing.screenshot({ path: 'test-results/connections-global-selection.png' });
      await page.waitForTimeout(3500);
    }
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await expect(second.getByText('connect-first@contact.test', { exact: true })).toBeVisible();
    await expect(second.getByText('555-0101', { exact: true })).toHaveCount(0);
    await second.getByText('connect-first@contact.test', { exact: true }).scrollIntoViewIfNeeded();
    await evidence(second, 'updated');
    await page.goto('/members/connect-second');
    await expect(page.getByText('555-0102', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Unfriend', exact: true }).click();
    await expect(page.getByText('555-0102', { exact: true })).toHaveCount(0);
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
