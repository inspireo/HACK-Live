import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect role/badge evidence only after the cumulative browser suite passes');
const demo = JSON.parse(await readFile('test-results/pr5-demo.json', 'utf8'));
if (demo.mode !== 'paced-real-emulator-browser' || demo.securityMocks !== false || demo.physicalDevice !== false || demo.shareAndClipboardAdaptersMocked !== true) throw new Error('Expected explicit real-emulator browser evidence and native-sharing limits');
if (!/^[a-f0-9]{40}$/.test(demo.sourceRevision || '')) throw new Error('Record the immutable product checkpoint with PARTICIPATION_SOURCE_REVISION');
const output = await readdir('test-results');
const staff = output.filter(entry => entry.startsWith('participation-journey-staf'));
const mixed = output.filter(entry => entry.startsWith('participation-journey-mixe'));
const mobile = (await readdir('test-results/pr5-mobile')).filter(entry => entry.endsWith('.webm'));
if (staff.length !== 1 || mixed.length !== 1 || mobile.length !== 1) throw new Error('Expected exactly one staff, one mixed-participant and one mobile journey recording');
await mkdir('docs/evidence', { recursive: true });
for (const [source, filename] of [
  [`test-results/${staff[0]}/video.webm`, 'pr5-staff-role-assignment.webm'],
  [`test-results/${mixed[0]}/video.webm`, 'pr5-mixed-participant-team-label.webm'],
  [`test-results/pr5-mobile/${mobile[0]}`, 'pr5-mobile-badge.webm'],
  ['test-results/pr5-staff-assignment.png', 'pr5-staff-assignment.png'],
  ['test-results/pr5-staff-resources.png', 'pr5-staff-resources.png'],
  ['test-results/pr5-badge-320.png', 'pr5-badge-320.png'],
  ['test-results/pr5-event-selector.png', 'pr5-event-selector.png'],
  ['test-results/pr5-profile-signin-destination.png', 'pr5-profile-signin-destination.png'],
  ['test-results/pr5-member-visible-profile.png', 'pr5-member-visible-profile.png'],
  ['test-results/pr5-badge-revoked.png', 'pr5-badge-revoked.png'],
  ['test-results/pr5-mixed-participant-team-label.png', 'pr5-mixed-participant-team-label.png'],
  ['test-results/pr5-mobile/badge-320.png', 'pr5-badge-320-full-page.png'],
  ['test-results/pr5-demo.json', 'pr5-browser-contract.json'],
]) {
  await copyFile(source, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes`);
}
