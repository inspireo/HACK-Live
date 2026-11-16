import { test, expect } from '@playwright/test';
import { emptyDetails } from '../../shared/profile';
import { createFixtureUser, fixtureDb, password } from '../fixtures';

for (const scenario of ['overlong terms', 'too many terms']) {
  test(`legacy skills allow progressive correction and persisted unrelated edits: ${scenario}`, async ({ page }) => {
    const uid = scenario === 'overlong terms' ? 'legacy-skills-long' : 'legacy-skills-count';
    const terms = scenario === 'overlong terms' ? ['a'.repeat(61), 'b'.repeat(61)] : Array.from({ length: 22 }, (_, position) => `Legacy skill ${position}`);
    await createFixtureUser(uid);
    await fixtureDb.doc(`profileDetails/${uid}`).set({ ...emptyDetails(), professional: { skills: terms.join(', ') } });
    await page.goto('/account');
    await page.getByLabel('Email', { exact: true }).fill(`${uid}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    const selected = page.getByRole('list', { name: 'Selected skills' });
    await expect(selected.getByRole('button')).toHaveCount(terms.length);
    await page.getByRole('button', { name: `Remove skill ${terms[0]}`, exact: true }).click();
    // The first corrective removal is allowed despite the still-invalid remainder.
    await expect(selected.getByRole('button')).toHaveCount(terms.length - 1);
    expect((await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!.professional.skills).toBe(terms.join(', '));
    await page.getByLabel('Name', { exact: true }).fill('Corrected legacy profile');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(scenario === 'overlong terms' ? '60 characters' : 'up to 20');
    expect((await fixtureDb.doc(`profiles/${uid}`).get()).data()!.name).toBe(`Synthetic ${uid}`);
    const skills = page.getByRole('combobox', { name: 'Skills', exact: true });
    await skills.fill('Python'); await skills.press('Enter');
    // Additions still validate all bounds; corrective removals do not.
    await expect(selected.getByRole('button', { name: 'Remove skill Python', exact: true })).toHaveCount(0);
    let remaining: string[];
    if (scenario === 'overlong terms') {
      await skills.fill(''); await skills.press('Backspace');
      await expect(selected.getByRole('button')).toHaveCount(0);
      await skills.fill('Recovered skill'); await skills.press('Enter'); await skills.press('Escape');
      remaining = ['Recovered skill'];
    } else {
      await page.getByRole('button', { name: `Remove skill ${terms[1]}`, exact: true }).click();
      await expect(selected.getByRole('button')).toHaveCount(20);
      remaining = terms.slice(2);
    }
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await page.reload();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Corrected legacy profile');
    await expect(selected.getByRole('button')).toHaveCount(remaining.length);
    expect((await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!.professional.skills).toBe(remaining.join(', '));
  });
}
