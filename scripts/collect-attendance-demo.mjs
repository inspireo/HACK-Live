import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const run = JSON.parse(await readFile('test-results/.last-run.json', 'utf8'));
if (run.status !== 'passed') throw new Error('Collect only a passed cumulative browser run');
const demo = JSON.parse(await readFile('test-results/pr6-demo.json', 'utf8'));
if (demo.mode !== 'paced-real-emulator-browser' || demo.authMocks !== false || demo.securityMocks !== false || demo.syntheticData !== true || !/^[a-f0-9]{40}$/.test(demo.sourceRevision || '')) throw new Error('Actual paced synthetic Firebase evidence with immutable source revision required');
const output = 'docs/evidence';
const fragments = '.agents/memory/tasks/thr_44h8h795x5/video-fragments';
await mkdir(output, { recursive: true }); await mkdir(fragments, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
// Playwright moves its fixture-owned staff video after test completion. Custom
// member/viewer contexts retain their configured paths.
if (!await stat(demo.videos.staff).catch(() => null)) {
  const folders = (await readdir('test-results')).filter(entry => entry.startsWith('attendance-journey-real-st'));
  if (folders.length !== 1) throw new Error('Expected exactly one actual staff journey video');
  demo.videos.staff = `test-results/${folders[0]}/video.webm`;
}
for (const [role, source] of Object.entries(demo.videos)) {
  await copyFile(source, `${output}/pr6-${role}-full.webm`);
}
const sequence = [];
for (const [index, clip] of demo.clips.entries()) {
  const length = clip.end - clip.start;
  if (length < 3 || length > 10 || !demo.videos[clip.role]) throw new Error('Invalid captured stage interval');
  const fragment = `${fragments}/${index}.webm`;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(clip.start), '-i', demo.videos[clip.role], '-t', String(length), '-vf', 'scale=1100:760,fps=25', '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '0', '-an', fragment]);
  sequence.push(`file '${index}.webm'`);
  await copyFile(`test-results/pr6-${clip.stage}.png`, `${output}/pr6-${clip.stage}.png`);
}
await writeFile(`${fragments}/sequence.txt`, sequence.join('\n'));
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${fragments}/sequence.txt`, '-c', 'copy', `${output}/pr6-attendance-history.webm`]);
await writeFile(`${output}/pr6-browser-contract.json`, JSON.stringify({ ...demo, videos: Object.fromEntries(Object.keys(demo.videos).map(role => [role, `pr6-${role}-full.webm`])) }, null, 2));
console.log(JSON.stringify({ video: `${output}/pr6-attendance-history.webm`, bytes: (await stat(`${output}/pr6-attendance-history.webm`)).size, stages: demo.clips.length, sourceRevision: demo.sourceRevision }));
