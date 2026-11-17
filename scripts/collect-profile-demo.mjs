import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect profile evidence only after the cumulative browser suite passes');
await mkdir('docs/evidence', { recursive: true });
const folders = await readdir('test-results');
const ownerFolder = folders.find(entry => entry.startsWith('profile-journey-'));
if (!ownerFolder) throw new Error('Missing profile owner journey recording');
const otherVideos = (await readdir('test-results/profile-other-member')).filter(entry => entry.endsWith('.webm'));
if (otherVideos.length !== 1) throw new Error('Expected exactly one other-member recording from the passing run');
for (const [source, filename] of [
  [`test-results/${ownerFolder}/video.webm`, 'pr2-profile-owner.webm'],
  [`test-results/profile-other-member/${otherVideos[0]}`, 'pr2-profile-other-member.webm'],
]) {
  await copyFile(source, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes`);
}
for (const filename of ['profile-owner-form.png', 'profile-community-preview.png', 'profile-other-member.png', 'profile-mobile-preview.png']) {
  await copyFile(`test-results/${filename}`, `docs/evidence/pr2-${filename}`);
}

const contactsFolder = folders.find(entry => entry.startsWith('profile-contacts-'));
if (!contactsFolder) throw new Error('Missing country selector owner recording');
await copyFile(`test-results/${contactsFolder}/video.webm`, 'docs/evidence/pr2-profile-country-selectors.webm');
for (const filename of ['profile-country-selectors.png', 'profile-country-selectors-mobile.png']) await copyFile(`test-results/${filename}`, `docs/evidence/pr2-${filename}`);
