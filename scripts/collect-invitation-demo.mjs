import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, parse } from 'node:path';
import { chromium } from '@playwright/test';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect invitation evidence only after passing browser tests');
const demo = JSON.parse(await readFile('test-results/invitation-demo.json', 'utf8'));
if (demo.mode !== 'paced-emulator-browser' || !demo.osContractsMocked || demo.physicalDevice || !demo.actualApp || !demo.softDeletionShown) throw new Error('Expected actual-app paced emulator evidence with labelled OS substitutions');
const folders = await readdir('test-results');
const sender = folders.filter(entry => entry.startsWith('event-invitation-organizer-') && entry.includes('cancellation'));
const recipient = (await readdir('test-results/invitation-recipient')).filter(entry => entry.endsWith('.webm'));
if (sender.length !== 1 || recipient.length !== 1) throw new Error('Expected exactly one organizer/sender and one mobile recipient recording');
let ffmpegPath = process.env.FFMPEG_PATH;
for (let directory = dirname(chromium.executablePath()); !ffmpegPath && directory !== parse(directory).root; directory = dirname(directory)) {
  const entries = await readdir(directory).catch(() => []);
  const folder = entries.filter(entry => entry.startsWith('ffmpeg-')).sort().at(-1);
  if (!folder) continue;
  const binaries = await readdir(join(directory, folder));
  const binary = binaries.find(entry => /^ffmpeg-(mac|linux|win64\.exe)$/.test(entry));
  if (binary) ffmpegPath = join(directory, folder, binary);
}
if (!ffmpegPath) throw new Error('Install Playwright Chromium/ffmpeg or set FFMPEG_PATH');
await mkdir('docs/evidence', { recursive: true });
const artifacts = [];
for (const [folder, name] of [[`${sender[0]}/video.webm`, 'pr3-invitation-mobile.webm'], [`invitation-recipient/${recipient[0]}`, 'pr3-invitation-recipient.webm']]) {
  const destination = `docs/evidence/${name}`;
  await copyFile(`test-results/${folder}`, destination);
  const bytes = await readFile(destination);
  const info = spawnSync(ffmpegPath, ['-hide_banner', '-i', destination], { encoding: 'utf8' }).stderr;
  const match = info.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const dimensions = info.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!match || !dimensions) throw new Error(`Could not inspect ${name}: ${info}`);
  artifacts.push({ path: destination, bytes: (await stat(destination)).size, sha256: createHash('sha256').update(bytes).digest('hex'), durationSeconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]), width: Number(dimensions[1]), height: Number(dimensions[2]) });
}
const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const manifest = { sourceSha, recordedAt: new Date().toISOString(), actualApp: true, fixtureData: 'synthetic emulator accounts/events', mocked: ['OS Web Share', 'OS clipboard'], real: ['application UI', 'Firebase auth', 'Firestore rules', 'invitation APIs', 'calendar download', 'explicit event registration'], physicalDevice: false, softDeletionShown: true, artifacts };
await writeFile('test-results/invitation-media-manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
