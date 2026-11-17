import { test, expect } from '@playwright/test';
import { clearFixtures, createFixtureUser, fixtureDb, password } from '../fixtures';
import { emptyDetails } from '../../shared/profile';

test('private contact drafts, linked and separate WhatsApp, normalized Telegram and legacy correction', async ({ page }) => {
  test.setTimeout(150000);
  const hold = async () => { if (process.env.PROFILE_DEMO === 'true') await page.waitForTimeout(4000); };
  await clearFixtures(); await createFixtureUser('contacts-browser');
  await fixtureDb.doc('profileDetails/contacts-browser').set({ ...emptyDetails(), contacts: { signal: { malformed: true }, telegram: 'invalid-old-value', phone: 'legacy-broken' }, connectionFields: ['signal'] });
  await page.goto('/account');
  await page.getByLabel('Email', { exact: true }).fill('contacts-browser@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  const mobile = page.getByLabel('Mobile number', { exact: true });
  const whatsapp = page.getByLabel('WhatsApp number', { exact: true });
  const linked = page.getByLabel('Use my mobile number for WhatsApp', { exact: true });
  const telegram = page.getByLabel('Telegram username or link', { exact: true });
  const save = page.getByRole('button', { name: 'Save profile', exact: true });
  await expect(linked).not.toBeChecked();
  await expect(mobile).toHaveValue('legacy-broken');
  await expect(page.getByLabel('Signal handle', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Correct this Telegram username or link, or clear it before saving.')).toBeVisible();
  await expect(mobile).toHaveAttribute('autocomplete', 'tel-national');
  const mobileCountry = page.getByRole('combobox', { name: 'Mobile country code', exact: true });
  const whatsappCountry = page.getByRole('combobox', { name: 'WhatsApp country code', exact: true });
  await expect(mobileCountry).toHaveValue('');
  await expect(whatsappCountry).toHaveValue('');
  await expect(mobileCountry.locator('option[value="+1"]')).toHaveCount(0);
  await expect(whatsappCountry.locator('option[value="+1"]')).toHaveCount(0);
  await expect(page.getByLabel('Contact email', { exact: true })).toHaveAttribute('autocomplete', 'email');
  await page.getByLabel('Bio', { exact: true }).fill('Unrelated retained edit');
  await save.click(); await expect(page.getByRole('alert')).toContainText('clear the field');
  await telegram.fill(''); await mobileCountry.selectOption('SG'); await mobile.fill('8123 4567'); await linked.check();
  await expect(whatsapp).toBeDisabled(); await expect(whatsapp).toHaveValue('8123 4567'); await expect(whatsappCountry).toHaveValue('SG'); await expect(whatsappCountry).toBeDisabled();
  await mobileCountry.scrollIntoViewIfNeeded(); await hold();
  await page.screenshot({ path: 'test-results/profile-country-selectors.png' });
  expect((await fixtureDb.doc('profileDetails/contacts-browser').get()).data()!.contacts.signal).toEqual({ malformed: true });
  await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await page.reload(); await expect(linked).toBeChecked(); await expect(whatsapp).toHaveValue('81234567');
  let source = (await fixtureDb.doc('profileDetails/contacts-browser').get()).data()!;
  expect(source.contacts.signal).toBeUndefined(); expect(source.connectionFields).toEqual([]);
  expect(source.professional.bio).toBe('Unrelated retained edit');
  await mobile.fill('+1 202 555 0199'); await expect(whatsapp).toHaveValue('2025550199'); await expect(mobileCountry).toHaveValue('+1'); await expect(whatsappCountry).toHaveValue('+1');
  await expect(mobileCountry.locator('option[value="+1"]')).toHaveCount(1);
  await mobileCountry.selectOption('US'); await expect(mobile).toHaveValue('2025550199');
  await expect(mobileCountry.locator('option[value="+1"]')).toHaveCount(0);
  await mobileCountry.selectOption('CA'); await expect(mobile).toHaveValue('2025550199');
  await expect(whatsappCountry).toHaveValue('CA');
  await hold();
  await telegram.fill('t.me/abcd'); await expect(page.getByRole('link', { name: '@abcd', exact: true })).toHaveAttribute('href', 'https://t.me/abcd');
  await page.getByLabel('Share WhatsApp number with all future accepted connections', { exact: true }).check();
  await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.'); await page.reload();
  await expect(whatsapp).toHaveValue('2025550199'); await expect(telegram).toHaveValue('@abcd');
  await expect(page.getByLabel('Share Mobile number with all future accepted connections', { exact: true })).not.toBeChecked();
  await linked.uncheck(); await whatsappCountry.selectOption('GB'); await whatsapp.fill('07700 900123'); await whatsappCountry.scrollIntoViewIfNeeded(); await hold(); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await page.reload(); await expect(linked).not.toBeChecked(); await expect(whatsapp).toHaveValue('7700900123');
  await mobile.fill('+65 8765 4321'); await expect(whatsapp).toHaveValue('7700900123');
  await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.'); await page.reload();
  await expect(mobile).toHaveValue('87654321'); await expect(whatsapp).toHaveValue('7700900123');
  await expect(whatsappCountry).toHaveValue('+44');
  await mobileCountry.selectOption('IT'); await expect(mobile).toHaveValue('87654321');
  await mobile.fill('02 36618 300'); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await page.reload(); await expect(mobile).toHaveValue('0236618300'); await expect(mobileCountry).toHaveValue('+39');
  expect((await fixtureDb.doc('profileDetails/contacts-browser').get()).data()!.contacts.phone).toBe('+390236618300');
  await mobile.fill(''); await mobileCountry.selectOption('SG'); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  expect((await fixtureDb.doc('profileDetails/contacts-browser').get()).data()!.contacts.phone).toBeUndefined();
  await page.reload(); await expect(mobile).toHaveValue(''); await expect(mobileCountry).toHaveValue('');
  await mobile.fill('81234567'); await save.click(); await expect(page.getByRole('alert')).toContainText('Choose a country code');
  await mobile.fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileCountry.selectOption('GB'); await mobileCountry.focus(); await mobileCountry.press('ArrowDown');
  await expect(mobileCountry).toBeFocused();
  await mobileCountry.scrollIntoViewIfNeeded(); await hold();
  await page.screenshot({ path: 'test-results/profile-country-selectors-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  source = (await fixtureDb.doc('profileDetails/contacts-browser').get()).data()!;
  expect(source.whatsappUsesMobile).toBe(false); expect(source.connectionFields).toEqual(['whatsapp']);
  expect((await fixtureDb.doc('memberDetails/contacts-browser').get()).data()).toEqual({});
  expect((await fixtureDb.doc('connectionContacts/contacts-browser').get()).exists).toBe(false);
});


test('explicit country corrections reject destination changes without writing until corrected', async ({ page }) => {
  await clearFixtures(); await createFixtureUser('country-correction');
  const sourceRef = fixtureDb.doc('profileDetails/country-correction');
  await sourceRef.set({ ...emptyDetails(), contacts: { phone: '+9991234567' } });
  await page.goto('/account');
  await page.getByLabel('Email', { exact: true }).fill('country-correction@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  const mobile = page.getByLabel('Mobile number', { exact: true });
  const country = page.getByRole('combobox', { name: 'Mobile country code', exact: true });
  const save = page.getByRole('button', { name: 'Save profile', exact: true });
  await expect(mobile).toHaveValue('+9991234567'); await expect(country).toHaveValue('');
  await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  expect((await sourceRef.get()).data()!.contacts.phone).toBe('+9991234567');
  const unchanged = (await sourceRef.get()).data();
  await country.selectOption('SG'); await save.click();
  await expect(page.getByRole('alert')).toContainText('unrecognized international number');
  expect((await sourceRef.get()).data()).toEqual(unchanged);
  await mobile.fill('81234567'); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  expect((await sourceRef.get()).data()!.contacts.phone).toBe('+6581234567');
  await country.selectOption('GB'); await mobile.fill('0049 30 123456'); await save.click();
  await expect(page.getByRole('alert')).toContainText('different international calling code');
  expect((await sourceRef.get()).data()!.contacts.phone).toBe('+6581234567');
  await mobile.fill('+49 30 123456'); await expect(country).toHaveValue('DE');
  await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
  await page.reload(); await expect(mobile).toHaveValue('30123456'); await expect(country).toHaveValue('DE');
  expect((await sourceRef.get()).data()!.contacts.phone).toBe('+4930123456');
});


test('reloaded shared calling codes require explicit country for edited national prefixes', async ({ page }) => {
  test.setTimeout(120000);
  await clearFixtures(); await createFixtureUser('shared-code-correction');
  const sourceRef = fixtureDb.doc('profileDetails/shared-code-correction');
  await sourceRef.set({ ...emptyDetails(), contacts: { phone: '+447700900123' } });
  await page.goto('/account');
  await page.getByLabel('Email', { exact: true }).fill('shared-code-correction@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  const mobile = page.getByLabel('Mobile number', { exact: true });
  const country = page.getByRole('combobox', { name: 'Mobile country code', exact: true });
  const save = page.getByRole('button', { name: 'Save profile', exact: true });
  for (const [canonical, national, countryCode, callingCode] of [
    ['+447700900123', '07700 900123', 'GB', '+44'],
    ['+12025550199', '1 202 555 0199', 'US', '+1'],
    ['+390236618300', '02 36618 300', 'IT', '+39'],
  ]) {
    await mobile.fill(canonical); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await page.reload(); await expect(country).toHaveValue(callingCode);
    await expect(country.locator('option:checked')).toContainText('shared calling code');
    const beforeEdit = (await sourceRef.get()).data();
    await mobile.fill(national); await save.click();
    await expect(page.getByRole('alert')).toContainText('Choose a country before editing');
    expect((await sourceRef.get()).data()).toEqual(beforeEdit);
    if (countryCode === 'GB') {
      await mobile.fill('0049 30 123456'); await save.click();
      await expect(page.getByRole('alert')).toContainText('Choose a country before editing');
      expect((await sourceRef.get()).data()).toEqual(beforeEdit);
      await mobile.fill(national);
    }
    await country.selectOption(countryCode); await save.click(); await expect(page.getByRole('status')).toHaveText('Profile saved.');
    expect((await sourceRef.get()).data()!.contacts.phone).toBe(canonical);
  }
});
