import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect invitation evidence only after the cumulative browser suite passes');
const demo = JSON.parse(await readFile('test-results/invitation-demo.json', 'utf8'));
if (demo.mode !== 'paced-emulator-browser' || !demo.osContractsMocked || demo.physicalDevice) throw new Error('Expected explicitly labelled paced browser contract evidence');
await mkdir('docs/evidence', { recursive: true });
const folders = (await readdir('test-results')).filter(entry => entry.startsWith('event-invitation-mobile-'));
if (folders.length !== 1) throw new Error('Expected exactly one sender recording from the passing run');
const recipientVideos = (await readdir('test-results/invitation-recipient')).filter(entry => entry.endsWith('.webm'));
if (recipientVideos.length !== 1) throw new Error('Expected exactly one recipient recording from the passing run');
for (const [source, filename] of [
  [`test-results/${folders[0]}/video.webm`, 'pr3-invitation-mobile.webm'],
  [`test-results/invitation-recipient/${recipientVideos[0]}`, 'pr3-invitation-recipient.webm'],
  ['test-results/invitation-manual-copy.png', 'pr3-invitation-manual-copy.png'],
  ['test-results/invitation-recipient-return.png', 'pr3-invitation-recipient-return.png'],
  ['test-results/invitation-demo.json', 'pr3-invitation-contract.json'],
]) {
  await copyFile(source, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes`);
}
