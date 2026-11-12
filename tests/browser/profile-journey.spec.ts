import { test, expect, type Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, password } from '../fixtures';

async function signIn(page: Page, uid: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
}

test.beforeAll(async () => {
  await clearFixtures();
  for (const uid of ['profile-browser-owner', 'profile-browser-other']) await createFixtureUser(uid);
  await fixtureDb.doc('registrationDefaults/profile-browser-owner').set({ adjective: 'Curious', designThinkingProficiency: 'Trained' });
});

test('real Firebase profile edits, community preview, other-member privacy, revocation and deletion', async ({ page, browser }) => {
  await page.goto('/account');
  await signIn(page, 'profile-browser-owner');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Professional Member');
  await page.getByLabel('Professional title or role', { exact: true }).fill('Community Engineer');
  await page.getByLabel('Bio', { exact: true }).fill('Private synthetic biography');
  await page.getByLabel('Company or organization', { exact: true }).fill('Synthetic Company');
  await page.getByLabel('Work information', { exact: true }).fill('Building community tools');
  await page.getByLabel('Skills', { exact: true }).fill('TypeScript, facilitation');
  await page.getByLabel('GitHub', { exact: true }).fill('https://github.com/synthetic');
  await page.getByLabel('LinkedIn', { exact: true }).fill('https://www.linkedin.com/in/synthetic');
  await page.getByLabel('Portfolio', { exact: true }).fill('https://example.test/portfolio');
  await page.getByLabel('Photo URL', { exact: true }).fill('https://example.test/synthetic-photo.png');
  await page.getByLabel('Contact email', { exact: true }).fill('private-contact@example.test');
  await page.getByLabel('Phone', { exact: true }).fill('+65 1234 5678');
  await page.getByLabel('Telegram handle', { exact: true }).fill('private-synthetic-handle');
  await page.getByLabel('Show Professional title or role to members', { exact: true }).check();
  await page.getByLabel('Show Skills to members', { exact: true }).check();
  await page.getByLabel('Show GitHub to members', { exact: true }).check();
  await page.getByLabel('Share Contact email with all future accepted connections', { exact: true }).check();
  await page.getByRole('button', { name: 'Preview community view' }).click();
  const preview = page.getByRole('region', { name: 'Community preview' });
  await expect(preview).toContainText('Community Engineer');
  await expect(preview).toContainText('TypeScript, facilitation');
  await expect(preview).not.toContainText('Private synthetic biography');
  await expect(preview).not.toContainText('private-contact@example.test');
  await expect(preview.getByRole('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await page.reload();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Private synthetic biography');
  await expect(page.getByLabel('Share Contact email with all future accepted connections', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Photo URL', { exact: true })).toHaveValue('https://example.test/synthetic-photo.png');
  expect((await fixtureDb.doc('registrationDefaults/profile-browser-owner').get()).data()).toEqual({ adjective: 'Curious', designThinkingProficiency: 'Trained' });
  expect((await fixtureDb.doc('connectionContacts/profile-browser-owner').get()).exists).toBe(false);
  await page.getByLabel('Portfolio', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.portfolio).toBe('https://example.test/portfolio');
  await page.getByLabel('Portfolio', { exact: true }).fill('https://example.test/portfolio');

  const otherContext = await browser.newContext({ recordVideo: { dir: 'test-results/profile-other-member', size: { width: 1100, height: 760 } } });
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto('/account'); await signIn(otherPage, 'profile-browser-other');
    await otherPage.goto('/members/profile-browser-owner');
    await expect(otherPage.getByRole('heading', { name: 'Synthetic Professional Member' })).toBeVisible();
    await expect(otherPage.getByText('Community Engineer', { exact: false })).toBeVisible();
    await expect(otherPage.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/synthetic');
    for (const privateText of ['Private synthetic biography', 'Synthetic Company', 'private-contact@example.test', '+65 1234 5678', 'private-synthetic-handle']) await expect(otherPage.getByText(privateText, { exact: false })).toHaveCount(0);
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
    await expect(otherPage.getByRole('button', { name: 'Save profile' })).toHaveCount(0);

    await page.getByLabel('Show Professional title or role to members', { exact: true }).uncheck();
    await page.getByLabel('Share Contact email with all future accepted connections', { exact: true }).uncheck();
    await page.getByLabel('Share Phone with all future accepted connections', { exact: true }).check();
    await page.getByLabel('Photo URL', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await expect.poll(async () => (await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.connectionFields).toEqual(['phone']);
    await expect(otherPage.getByText('Community Engineer', { exact: false })).toHaveCount(0);
    expect((await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.avatarUrl).toBeUndefined();

    // Mobile layout uses the same real account and private source, without a second signup.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Preview community view' }).click();
    await expect(preview).toContainText('TypeScript, facilitation');
    await expect(preview).not.toContainText('Community Engineer');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
    await expect(otherPage.getByText('Member unavailable.', { exact: true })).toBeVisible();
    for (const collectionName of ['profileDetails', 'memberDetails']) expect((await fixtureDb.doc(`${collectionName}/profile-browser-owner`).get()).exists).toBe(false);
  } finally { await otherContext.close(); }
});
