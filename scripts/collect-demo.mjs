import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect evidence only after a fully passing browser run');

// Find the ffmpeg that Playwright already installed, including custom caches.
// FFMPEG_PATH can override it; no app/emulator or additional download is needed.
let ffmpegPath = process.env.FFMPEG_PATH;
for (let directory = dirname(chromium.executablePath()); !ffmpegPath && directory !== parse(directory).root; directory = dirname(directory)) {
  const entries = await readdir(directory).catch(() => []);
  const ffmpegFolder = entries.filter(entry => entry.startsWith('ffmpeg-')).sort().at(-1);
  if (!ffmpegFolder) continue;
  const binaries = await readdir(join(directory, ffmpegFolder));
  const binary = binaries.find(entry => /^ffmpeg-(mac|linux|win64\.exe)$/.test(entry));
  if (binary) ffmpegPath = join(directory, ffmpegFolder, binary);
}
if (!ffmpegPath) throw new Error('Set FFMPEG_PATH to ffmpeg or install Playwright Chromium (which includes ffmpeg)');
await mkdir('docs/evidence', { recursive: true });
function retime(source, destination) {
  // Stream-copy: retain every encoded frame exactly, scaling timestamps only.
  // Four times the duration makes the real automated flow easier to review.
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-itsscale', '4', '-i', source, '-c', 'copy', destination], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg retiming failed');
}
const folders = await readdir('test-results');
for (const [prefix, filename] of [['member-journey-demo-', 'pr1-sign-in-reuse.webm'], ['member-journey-event-code-', 'pr1-workshop-team-display.webm']]) {
  const folder = folders.find(entry => entry.startsWith(prefix));
  if (!folder) throw new Error(`Missing recorded journey: ${prefix}`);
  retime(`test-results/${folder}/video.webm`, `docs/evidence/${filename}`);
  console.log(`${filename}: ${(await stat(`docs/evidence/${filename}`)).size} bytes (4x timestamp duration)`);
}
const fresh = (await readdir('test-results/fresh-device')).find(entry => entry.endsWith('.webm'));
if (!fresh) throw new Error('Missing fresh-device recording');
retime(`test-results/fresh-device/${fresh}`, 'docs/evidence/pr1-fresh-device.webm');
