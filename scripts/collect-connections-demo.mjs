import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect connection evidence only after the cumulative browser suite passes');
const demo = JSON.parse(await readFile('test-results/connections-demo.json', 'utf8'));
if (demo.mode !== 'paced-real-emulator-browser' || demo.securityMocks !== false || demo.physicalDevice !== false) throw new Error('Expected explicitly labelled real-emulator browser evidence');
const senderFolders = (await readdir('test-results')).filter(entry => entry.startsWith('connections-two-members-'));
if (senderFolders.length !== 1) throw new Error('Expected one sender journey recording');
const recipientVideos = (await readdir('test-results/connections-second')).filter(entry => entry.endsWith('.webm'));
if (recipientVideos.length !== 1) throw new Error('Expected one recipient recording');
await mkdir('docs/evidence', { recursive: true });
for (const [source, filename] of [
  [`test-results/${senderFolders[0]}/video.webm`, 'pr4-connections-sender.webm'],
  [`test-results/connections-second/${recipientVideos[0]}`, 'pr4-connections-recipient.webm'],
  ['test-results/connections-request.png', 'pr4-connections-request.png'],
  ['test-results/connections-acceptance.png', 'pr4-connections-acceptance.png'],
  ['test-results/connections-approved.png', 'pr4-connections-approved.png'],
  ['test-results/connections-global-selection.png', 'pr4-connections-global-selection.png'],
  ['test-results/connections-updated.png', 'pr4-connections-updated.png'],
  ['test-results/connections-unfriended.png', 'pr4-connections-unfriended.png'],
  ['test-results/connections-declined.png', 'pr4-connections-declined.png'],
  ['test-results/connections-cancelled.png', 'pr4-connections-cancelled.png'],
  ['test-results/connections-blocked.png', 'pr4-connections-blocked.png'],
  ['test-results/connections-demo.json', 'pr4-connections-contract.json'],
]) {
  await copyFile(source, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes`);
}
