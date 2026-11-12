import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect evidence only after a fully passing browser run');
await mkdir('docs/evidence', { recursive: true });
const folders = await readdir('test-results');
for (const [prefix, filename] of [['member-journey-demo-', 'pr1-sign-in-reuse.webm'], ['member-journey-event-code-', 'pr1-workshop-team-display.webm']]) {
  const folder = folders.find(entry => entry.startsWith(prefix));
  if (!folder) throw new Error(`Missing recorded journey: ${prefix}`);
  await copyFile(`test-results/${folder}/video.webm`, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes`);
}
const fresh = (await readdir('test-results/fresh-device')).find(entry => entry.endsWith('.webm'));
if (!fresh) throw new Error('Missing fresh-device recording');
await copyFile(`test-results/fresh-device/${fresh}`, 'docs/evidence/pr1-fresh-device.webm');
