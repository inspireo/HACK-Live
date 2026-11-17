import { test, expect, type Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, password, seedEvents, callIdentity, signInFixture } from '../fixtures';
import { emptyDetails } from '../../shared/profile';
import { publishFixture, publicFields } from '../invitation-fixtures';

async function login(page: Page, uid = 'help-owner', route = '/account') {
  await page.goto(route);
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live', exact: true })).toHaveCount(0);
}
async function noOverflow(page: Page) {
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })).slice(0, 12) }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
}
async function help(page: Page, label: string, key = 'Enter') {
  const trigger = page.getByRole('button', { name: `Help: ${label}`, exact: true });
  await expect(trigger).toHaveAttribute('type', 'button');
  expect(await trigger.evaluate(element => element.closest('label'))).toBeNull();
  const bounds = await trigger.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await trigger.focus(); await trigger.press(key);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
  return trigger;
}

test.beforeEach(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'help-owner', 'help-peer']) await createFixtureUser(uid);
  expect((await callIdentity(await signInFixture('help-owner'), 'save-profile', {
    name: 'Synthetic Help Member', ...emptyDetails(), professional: { bio: 'Synthetic primary profile content', skills: 'Design' }, contacts: { phone: '+6581234567', contactEmail: 'help@contact.test' }, connectionFields: ['contactEmail'],
  })).status).toBe(200);
});

for (const width of [320, 390]) {
  test(`profile help at ${width}px preserves unsaved data consent and global sharing without submitting`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await login(page);
    const source = fixtureDb.doc('profileDetails/help-owner'); const before = (await source.get()).data();
    const posts: string[] = [];
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/identity/save-profile')) posts.push(request.url()); });
    const name = page.getByLabel('Name', { exact: true }); await name.fill('Unsaved Help Member');
    const consent = page.getByLabel('Share Mobile number with all approved connections', { exact: true }); await consent.check();
    await expect(page.getByText('Private unless selected · One selection for ALL current and future approved connections.', { exact: true })).toBeVisible();
    let trigger = await help(page, 'Contact sharing');
    await expect(page.getByRole('dialog')).toContainText('every current and future approved connection');
    await noOverflow(page); await page.screenshot({ path: `docs/evidence/ui8-profile-sharing-${width}.png` });
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger = await help(page, 'Mobile number', 'Space');
    await expect(page.getByRole('dialog')).toContainText('No country is selected by default');
    await noOverflow(page); await page.screenshot({ path: `docs/evidence/ui8-profile-mobile-help-${width}.png` });
    await page.getByRole('button', { name: 'Close help: Mobile number', exact: true }).click(); await expect(trigger).toBeFocused();
    await help(page, 'Skills'); await page.getByLabel('Name', { exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(name).toBeFocused();
    await expect(consent).toBeChecked(); await expect(name).toHaveValue('Unsaved Help Member');
    await expect(page.getByLabel('Share Contact email with all approved connections', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Show Bio to members', { exact: true })).not.toBeChecked();
    await help(page, 'WhatsApp number'); await page.keyboard.press('Escape');
    await expect(page.getByLabel('Use my mobile number for WhatsApp', { exact: true })).not.toBeChecked();
    await help(page, 'Organizer-assisted legacy linking');
    await expect(page.getByRole('textbox', { name: 'Account ID', exact: true })).toHaveValue('help-owner');
    await expect(page.getByRole('textbox', { name: 'Account ID', exact: true })).toHaveAttribute('readonly', '');
    await page.keyboard.press('Escape');
    expect(posts).toEqual([]); expect((await source.get()).data()).toEqual(before);
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Profile saved\.$/ })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect((await source.get()).data()!.connectionFields.sort()).toEqual(['contactEmail', 'phone']);
    expect((await fixtureDb.doc('connectionContacts/help-owner').get()).data()).toEqual({ phone: '+6581234567', contactEmail: 'help@contact.test' });
    await noOverflow(page);
  });

  test(`connections help at ${width}px supports tap keyboard outside focus and preserves choices`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await login(page, 'help-owner', '/connections');
    const mutations: string[] = [];
    page.on('request', request => { if (/\/connections\/(request|accept|decline|cancel|block|unfriend)$/.test(request.url())) mutations.push(request.url()); });
    const overview = page.getByRole('button', { name: 'Help: Connections and contact sharing', exact: true });
    await overview.tap(); await expect(page.getByRole('dialog')).toContainText('Sharing a team or attending an event does not connect you.');
    await noOverflow(page); await page.screenshot({ path: `docs/evidence/ui8-connections-${width}.png` });
    await page.getByRole('heading', { name: 'Connections', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await help(page, 'Connections and contact sharing', 'Space'); await page.keyboard.press('Escape'); await expect(overview).toBeFocused();
    await page.goto('/members/help-peer');
    await expect(page.getByRole('button', { name: 'Request connection', exact: true })).toBeVisible();
    const revoke = await help(page, 'Unfriend and block'); await noOverflow(page); await page.keyboard.press('Escape'); await expect(revoke).toBeFocused();
    expect(mutations).toEqual([]);
    await page.getByRole('button', { name: 'Request connection', exact: true }).click();
    await expect(page.getByText(/You will share after acceptance: Contact email/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send request', exact: true })).toBeVisible();
    await help(page, 'Unfriend and block'); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Send request', exact: true })).toBeVisible(); expect(mutations).toEqual([]);
    expect((await fixtureDb.doc('connectionViews/help-owner/peers/help-peer').get()).exists).toBe(false);
  });
}

test.use({ hasTouch: true });

test('admin field help preserves publication values flags primary actions and public content', async ({ page, browser }) => {
  await login(page, 'organizer', '/admin/event-one');
  await page.getByRole('button', { name: 'Public invitation', exact: true }).click();
  const title = page.getByLabel('Public event title', { exact: true }); await title.fill('Unsaved public title');
  const trigger = await help(page, 'Event timezone (IANA)');
  await expect(page.getByRole('dialog')).toContainText('Asia/Singapore');
  await page.screenshot({ path: 'docs/evidence/ui8-admin-field-help.png' });
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(title).toHaveValue('Unsaved public title');
  await expect(page.getByLabel('Registration required', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Add to calendar', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Publish event details', exact: true })).toBeEnabled();
  await expect(page.getByText('Only these fields become public. Workshop content and profiles stay behind sign-in.', { exact: true })).toBeVisible();
  expect((await fixtureDb.doc('eventPublications/event-one').get()).exists).toBe(false);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await help(page, 'Challenge discovery configuration'); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Delete event', exact: true })).toBeVisible();
  const published = await publishFixture();
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } }); const publicPage = await context.newPage();
  try {
    await publicPage.goto(`http://127.0.0.1:3000/invite/${published.token}`);
    await expect(publicPage.getByRole('heading', { name: publicFields.title, exact: true })).toBeVisible();
    await expect(publicPage.getByText(publicFields.description, { exact: true })).toBeVisible();
    await expect(publicPage.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
    await expect(publicPage.getByRole('link', { name: 'Add to calendar', exact: true })).toBeVisible();
    await noOverflow(publicPage); await publicPage.screenshot({ path: 'docs/evidence/ui8-public-content-320.png' });
  } finally { await context.close(); }
});

test('light badge help and 56px photo slot retain contrast geometry and QR primary content', async ({ page }) => {
  expect((await callIdentity(await signInFixture('organizer'), 'event-roles', { sessionId: 'event-one', memberUid: 'help-owner', roles: ['mentor'] })).status).toBe(200);
  await page.setViewportSize({ width: 320, height: 844 }); await login(page, 'help-owner', '/badge');
  const badge = page.getByRole('article', { name: 'Personal event badge' });
  await expect(badge).toBeVisible();
  const slot = badge.locator('[data-badge-profile-header] > span');
  expect((await slot.boundingBox())!.width).toBe(56);
  await help(page, 'Badge profile visibility'); await noOverflow(page);
  await expect(page.getByRole('dialog')).toHaveClass(/ui-light/);
  await expect(page.getByRole('dialog')).toContainText('does not grant contact access');
  await page.screenshot({ path: 'docs/evidence/ui8-light-badge-help-320.png' });
  await page.keyboard.press('Escape'); await expect(badge.getByText('Scan to view my member profile', { exact: true })).toBeVisible();
  await expect(badge.getByRole('heading', { name: 'Official event roles', exact: true })).toBeVisible(); await noOverflow(page);
});
