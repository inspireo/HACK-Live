import { test, expect, type Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, password } from '../fixtures';
import { photoFixture } from '../photo-fixture';

// Deliberate reading pauses only for reviewer evidence; normal regressions stay fast.
async function reviewerHold(page: Page) {
  if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(4000);
}

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
  if (process.env.PROFILE_DEMO === 'true') test.setTimeout(240000);
  await page.goto('/account');
  await signIn(page, 'profile-browser-owner');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Professional Member');
  await page.getByLabel('Professional title or role', { exact: true }).fill('Community Engineer');
  await page.getByLabel('Bio', { exact: true }).fill('Private synthetic biography');
  await page.getByLabel('Company or organization', { exact: true }).fill('Synthetic Company');
  await page.getByLabel('Work information', { exact: true }).fill('Building community tools');
  const skills = page.getByRole('combobox', { name: 'Skills', exact: true });
  await skills.fill('Type');
  await expect(page.getByRole('option', { name: 'TypeScript', exact: true })).toBeVisible();
  await skills.press('Enter');
  await skills.fill('facilitation');
  await skills.press('Enter');
  await skills.fill('Community mentoring');
  await page.getByRole('option', { name: 'Add “Community mentoring”' }).click();
  await expect(page.getByRole('list', { name: 'Selected skills' })).toContainText('Community mentoring');
  await page.getByRole('button', { name: 'Remove skill Community mentoring', exact: true }).click();
  await skills.fill('Python'); await skills.press('ArrowDown'); await skills.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove skill Python', exact: true })).toBeVisible();
  await skills.press('Backspace');
  await skills.press('Escape');
  await expect(skills).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Toggle skills list' }).click();
  await expect(page.getByRole('listbox', { name: 'Available skills' })).toBeVisible();
  await page.getByRole('option', { name: '✓ TypeScript', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove skill TypeScript', exact: true })).toHaveCount(0);
  await skills.fill('TypeScript'); await skills.press('Enter');
  await skills.fill('Community mentoring'); await skills.press('Enter'); await skills.press('Escape');
  await page.getByLabel('GitHub', { exact: true }).fill('https://github.com/synthetic');
  await page.getByLabel('LinkedIn', { exact: true }).fill('https://www.linkedin.com/in/synthetic');
  await page.getByLabel('Portfolio', { exact: true }).fill('https://example.test/portfolio');
  const photoInput = page.getByLabel('Photo (optional)', { exact: true });
  await expect(page.getByLabel('Photo URL', { exact: true })).toHaveCount(0);
  await photoInput.setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG');
  await photoInput.setInputFiles(await photoFixture());
  await expect(page.getByRole('img', { name: 'New photo preview' })).toBeVisible();
  expect((await fixtureDb.doc('profilePhotos/profile-browser-owner').get()).exists).toBe(false);
  await page.getByLabel('Bio', { exact: true }).scrollIntoViewIfNeeded();
  await reviewerHold(page);
  await page.getByLabel('Contact email', { exact: true }).fill('private-contact@example.test');
  await page.getByRole('combobox', { name: 'Mobile country code', exact: true }).selectOption('GB');
  await page.getByLabel('Mobile number', { exact: true }).fill('1234 5678');
  await page.getByRole('combobox', { name: 'Mobile country code', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await reviewerHold(page);
  await page.getByRole('combobox', { name: 'Mobile country code', exact: true }).selectOption('SG');
  await expect(page.getByLabel('Mobile number', { exact: true })).toHaveValue('1234 5678');
  await page.getByLabel('Telegram username or link', { exact: true }).fill('https://t.me/synthetic_member');
  await expect(page.getByRole('link', { name: '@synthetic_member', exact: true })).toHaveAttribute('href', 'https://t.me/synthetic_member');
  await expect(page.getByLabel('Use my mobile number for WhatsApp', { exact: true })).not.toBeChecked();
  await page.getByLabel('Use my mobile number for WhatsApp', { exact: true }).check();
  await expect(page.getByLabel('WhatsApp number', { exact: true })).toHaveValue('1234 5678');
  await page.getByRole('group', { name: 'Private contact details' }).scrollIntoViewIfNeeded();
  await reviewerHold(page);
  await page.getByLabel('Show Professional title or role to members', { exact: true }).check();
  await page.getByLabel('Show Skills to members', { exact: true }).check();
  await page.getByLabel('Show GitHub to members', { exact: true }).check();
  await page.getByLabel('Share Contact email with all future accepted connections', { exact: true }).check();
  await page.screenshot({ path: 'test-results/profile-owner-form.png', fullPage: true });
  await reviewerHold(page);
  await page.getByRole('button', { name: 'Preview community view' }).click();
  const preview = page.getByRole('region', { name: 'Community preview' });
  await expect(preview).toContainText('Community Engineer');
  await expect(preview).toContainText('Facilitation, TypeScript, Community mentoring');
  await expect(preview).not.toContainText('Private synthetic biography');
  await expect(preview).not.toContainText('private-contact@example.test');
  await expect(preview.getByRole('img')).toHaveCount(0);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/profile-community-preview.png' });
  await reviewerHold(page);
  const initialSave = page.waitForResponse(response => response.url().endsWith('/api/identity/save-profile') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  expect((await initialSave).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: /^Profile saved\.$/ })).toHaveText('Profile saved.');
  await page.reload();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Private synthetic biography');
  await expect(page.getByLabel('Share Contact email with all future accepted connections', { exact: true })).toBeChecked();
  await expect(page.getByRole('img', { name: 'Member avatar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove skill TypeScript', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove skill Community mentoring', exact: true })).toBeVisible();
  const firstPhotoUrl = (await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.avatarUrl;
  await expect(page.getByRole('button', { name: 'Remove skill Facilitation', exact: true })).toBeVisible();
  await reviewerHold(page);
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
    for (const privateText of ['Private synthetic biography', 'Synthetic Company', 'private-contact@example.test', '+65 1234 5678', 'https://t.me/synthetic_member']) await expect(otherPage.getByText(privateText, { exact: false })).toHaveCount(0);
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
    await expect(otherPage.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
    await otherPage.screenshot({ path: 'test-results/profile-other-member.png' });
    await reviewerHold(otherPage);

    await page.getByLabel('Show Photo to members', { exact: true }).check();
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toBeVisible();
    await reviewerHold(otherPage);
    // Replacement stays a draft, then invalidates the previous URL after save.
    await photoInput.setInputFiles(await photoFixture('#884433'));
    expect((await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.avatarUrl).toBe(firstPhotoUrl);
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toBeVisible();
    await reviewerHold(page);
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect.poll(async () => (await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.avatarUrl).not.toBe(firstPhotoUrl);
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toBeVisible();
    // Delay a real authenticated photo response; revocation must win over the in-flight fetch.
    let photoStarted!: () => void;
    let releasePhoto!: () => void;
    const pendingPhoto = new Promise<void>(resolve => { photoStarted = resolve; });
    const delayedPhoto = new Promise<void>(resolve => { releasePhoto = resolve; });
    await otherPage.route('**/api/identity/photo/**', async route => {
      const response = await route.fetch(); photoStarted(); await delayedPhoto;
      await route.fulfill({ response }).catch(() => {});
    });
    await otherPage.reload();
    await pendingPhoto;
    await page.getByLabel('Show Photo to members', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect.poll(async () => (await fixtureDb.doc('memberDetails/profile-browser-owner').get()).data()!.avatarUrl).toBeUndefined();
    releasePhoto();
    await otherPage.unroute('**/api/identity/photo/**');
    await expect(otherPage.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
    await reviewerHold(otherPage);

    await page.getByLabel('Show Professional title or role to members', { exact: true }).uncheck();
    await page.getByLabel('Share Contact email with all future accepted connections', { exact: true }).uncheck();
    await page.getByLabel('Share Mobile number with all future accepted connections', { exact: true }).check();
    await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
    expect((await fixtureDb.doc('profilePhotos/profile-browser-owner').get()).exists).toBe(true);
    await expect(page.getByText('Photo will be removed when you save.')).toBeVisible();
    const removedSave = page.waitForResponse(response => response.url().endsWith('/api/identity/save-profile') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    expect((await removedSave).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: /^Profile saved\.$/ })).toHaveText('Profile saved.');
    await expect.poll(async () => (await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.connectionFields).toEqual(['phone']);
    await expect(otherPage.getByText('Community Engineer', { exact: false })).toHaveCount(0);
    await reviewerHold(otherPage);
    expect((await fixtureDb.doc('profileDetails/profile-browser-owner').get()).data()!.professional.avatarUrl).toBeUndefined();
    expect((await fixtureDb.doc('profilePhotos/profile-browser-owner').get()).exists).toBe(false);
    await photoInput.setInputFiles(await photoFixture('#334488'));
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Member avatar' })).toBeVisible();

    // Mobile layout uses the same real account and private source, without a second signup.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Preview community view' }).click();
    await expect(preview).toContainText('Facilitation, TypeScript, Community mentoring');
    await expect(preview).not.toContainText('Community Engineer');
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/profile-mobile-preview.png' });
    await reviewerHold(page);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
    await expect(otherPage.getByText('Member unavailable.', { exact: true })).toBeVisible();
    await reviewerHold(page);
    for (const collectionName of ['profileDetails', 'memberDetails', 'profilePhotos']) expect((await fixtureDb.doc(`${collectionName}/profile-browser-owner`).get()).exists).toBe(false);
  } finally { await otherContext.close(); }
});
