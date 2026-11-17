import { test, expect, type Page } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, signInFixture, callIdentity, password } from '../fixtures';
import { photoFixture } from '../photo-fixture';
import { emptyDetails } from '../../shared/profile';

const owner = 'photo-loading-owner';
async function savePhoto(color = '#337766') {
  const photo = await photoFixture(color);
  const details = (await fixtureDb.doc(`profileDetails/${owner}`).get()).data() || emptyDetails();
  const result = await callIdentity(await signInFixture(owner), 'save-profile', { name: 'Synthetic Photo Member', ...details, communityFields: ['avatarUrl'], photoUpload: { contentType: photo.mimeType, base64: photo.buffer.toString('base64') } });
  expect(result.status).toBe(200);
  return result.data.details.professional.avatarUrl as string;
}
async function login(page: Page, uid = 'photo-loading-viewer') {
  await page.goto('/account');
  await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}
async function geometry(page: Page) {
  return page.locator('[data-profile-header]').evaluate(element => {
    const rect = (target: Element) => { const bounds = target.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; };
    return { header: rect(element), slot: rect(element.firstElementChild!), name: rect(element.lastElementChild!) };
  });
}
async function trackResources(page: Page) {
  await page.addInitScript(() => {
    const created: string[] = []; const revoked: string[] = []; const aborted: string[] = [];
    (window as any).photoResources = { created, revoked, aborted };
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const source = create(blob); created.push(source); return source; };
    URL.revokeObjectURL = source => { revoked.push(source); revoke(source); };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      if (String(input).includes('/api/identity/photo/')) options?.signal?.addEventListener('abort', () => aborted.push(String(input)));
      return originalFetch(input, options);
    };
  });
}

test.beforeEach(async () => {
  await clearFixtures();
  await createFixtureUser(owner); await createFixtureUser('photo-loading-viewer');
  await fixtureDb.doc(`profiles/${owner}`).update({ name: 'Synthetic Photo Member' });
});

test('shared header reserves photo beside name through protected fetch and real image decode; owner preview uses same slot', async ({ page }) => {
  await savePhoto(); await trackResources(page);
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function() {
      const pending = decode.call(this);
      (window as any).photoDecodeCount = ((window as any).photoDecodeCount || 0) + 1;
      return new Promise<void>((resolve, reject) => { (window as any).releasePhotoDecode = () => pending.then(resolve, reject); });
    };
  });
  await login(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/identity/photo/**', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const response = await route.fetch(); await held; await route.fulfill({ response }).catch(() => {});
  });
  await page.goto(`/members/${owner}`);
  const loading = page.getByRole('status', { name: 'Loading profile photo' });
  await expect(loading).toBeVisible();
  const before = await geometry(page);
  expect(before.slot.width).toBe(96); expect(before.slot.height).toBe(96);
  expect(before.name.x).toBeGreaterThan(before.slot.x + before.slot.width);
  expect(before.name.y).toBeLessThan(before.slot.y + before.slot.height);
  await page.screenshot({ path: 'test-results/photo-loading-shared.png' });
  if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(2500);
  release();
  await expect.poll(() => page.evaluate(() => typeof (window as any).releasePhotoDecode)).toBe('function');
  await expect(loading).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  await page.evaluate(() => (window as any).releasePhotoDecode());
  await expect(page.getByRole('img', { name: 'Member avatar' })).toBeVisible();
  await expect(loading).toHaveCount(0); expect(await geometry(page)).toEqual(before);
  await page.screenshot({ path: 'test-results/photo-loaded-shared.png' });
  if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(2500);
  await page.goto('/account');

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live', exact: true })).toBeVisible();
  await login(page, owner);
  await expect.poll(() => page.evaluate(() => typeof (window as any).releasePhotoDecode)).toBe('function');
  await page.evaluate(() => (window as any).releasePhotoDecode());
  await page.getByRole('button', { name: 'Preview community view' }).click();
  const preview = page.getByRole('region', { name: 'Community preview' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.getByRole('status', { name: 'Loading profile photo' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).photoDecodeCount)).toBe(2);
  const ownerBefore = await geometry(page);
  await page.screenshot({ path: 'test-results/photo-loading-owner.png' });
  if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).releasePhotoDecode());
  await expect(preview.getByRole('img', { name: 'Member avatar' })).toBeVisible();
  expect(await geometry(page)).toEqual(ownerBefore);
  await page.screenshot({ path: 'test-results/photo-loaded-owner.png' });
  if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(2500);
});

for (const failure of ['HTTP error', 'invalid image'] as const) {
  test(`no shared photo and ${failure} retain neutral header geometry without stuck loading`, async ({ page }) => {
    await login(page); await page.goto(`/members/${owner}`);
    await expect(page.locator('[data-profile-header]')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading profile photo' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
    const before = await geometry(page);
    await page.route('**/api/identity/photo/**', route => route.fulfill({ status: failure === 'HTTP error' ? 403 : 200, contentType: 'image/webp', body: 'not an image' }));
    await savePhoto();
    await expect(page.locator('[aria-label="Photo unavailable"]')).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Loading profile photo' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
    expect(await geometry(page)).toEqual(before);
  });
}

test('URL replacement, sharing revocation and auth unmount abort pending photos and revoke every object URL', async ({ page }) => {
  const originalUrl = await savePhoto(); await trackResources(page); await login(page);
  await page.goto(`/members/${owner}`);
  await expect(page.getByRole('img', { name: 'Member avatar' })).toBeVisible();
  const before = await geometry(page);
  let release!: () => void; let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/identity/photo/**', async route => { const response = await route.fetch(); started(); await held; await route.fulfill({ response }).catch(() => {}); });
  const replacedUrl = await savePhoto('#884433'); expect(replacedUrl).not.toBe(originalUrl);
  await requested;
  await expect(page.getByRole('status', { name: 'Loading profile photo' })).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  await expect.poll(() => page.evaluate(() => (window as any).photoResources.revoked.length)).toBe(1);
  await fixtureDb.doc(`memberDetails/${owner}`).set({});
  await expect(page.getByRole('status', { name: 'Loading profile photo' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).photoResources.aborted.length)).toBe(2);
  release(); await page.unroute('**/api/identity/photo/**');
  await expect(page.getByRole('img', { name: 'Member avatar' })).toHaveCount(0);
  expect(await geometry(page)).toEqual(before);
  await fixtureDb.doc(`memberDetails/${owner}`).set({ avatarUrl: replacedUrl });
  await expect(page.getByRole('img', { name: 'Member avatar' })).toBeVisible();
  // Change real Firebase auth while this protected component is mounted.
  await page.evaluate(async () => {
    const { auth } = await import('/src/firebase.ts' as string);
    const { signOut } = await import('/node_modules/.vite/deps/firebase_auth.js' as string);
    await signOut(auth);
  });
  await expect(page.getByRole('heading', { name: 'Sign in to #HACK Live' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => { const resources = (window as any).photoResources; return resources.created.length === 2 && resources.created.every((source: string) => resources.revoked.includes(source)); })).toBe(true);
});
