import { readFile, readdir, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, basename, join, relative } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

// Collect existing successful browser recordings only. This script starts no app.
const options = process.argv.slice(2);
if (options.length < 4 || options[0] !== '--output' || options[2] !== '--inputs') throw new Error('Usage: node scripts/collect-review-demos.mjs --output <new ignored directory> --inputs <archived run> [<newer run>...]');
const output = resolve(options[1]);
if (await stat(output).catch(() => null)) throw new Error('Refusing to overwrite an existing capture');
const reports = [];
for (const directory of options.slice(3)) {
  const input = resolve(directory);
  const report = JSON.parse(await readFile(join(input, 'review-recording-report.json'), 'utf8'));
  if (report.sourceDiff) throw new Error('Recording source must have no uncommitted source/test/harness changes');
  const changedProduct = execFileSync('git', ['diff', '--name-only', '10083d20578e3e23c96941830ce44c64e6935f41', report.sourceSha, '--', 'src', 'server', 'shared', 'firestore.rules', 'firestore.indexes.json'], { encoding: 'utf8' }).trim();
  if (changedProduct) throw new Error(`Product changed after accepted UI source: ${changedProduct}`);
  reports.push({ ...report, input });
}
const normal = JSON.parse(await readFile('.agents/memory/tasks/thr_yumv8gmirt/normal-validation.json', 'utf8'));
if (normal.status !== 'passed') throw new Error('Require successful normal business validation');
const catalog = JSON.parse(await readFile('scripts/review-demo-catalog.json', 'utf8'));
if (catalog.assets.length !== 24 || new Set(catalog.assets.map(asset => asset.logicalId)).size !== 24) throw new Error('Require exactly 24 distinct planned assets');
const ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) throw new Error('Set FFMPEG_PATH to a full ffmpeg build');
function runFFmpeg(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'ffmpeg failed');
  return result;
}
async function fingerprint(path) {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function testResult(selector) {
  for (const report of [...reports].reverse()) {
    const found = report.tests.filter(result => basename(result.file) === selector.sourceTest && result.title.includes(selector.titleIncludes) && result.status === 'passed' && !result.retry);
    if (found.length > 1) throw new Error(`Ambiguous passed recording: ${JSON.stringify(selector)}`);
    if (found.length === 1) return { ...found[0], runDirectory: report.input, runStatus: report.status, runStartedAt: report.startedAt, sourceSha: report.sourceSha, sourceTree: report.sourceTree };
  }
  throw new Error(`No complete individually PASSED recording: ${JSON.stringify(selector)}`);
}
async function primaryVideo(result) {
  const candidates = result.attachments.filter(attachment => attachment.contentType === 'video/webm');
  const firstPage = candidates.filter(attachment => basename(attachment.path) === 'video.webm');
  if (firstPage.length === 1) return join(result.runDirectory, relative(resolve('test-results'), firstPage[0].path));
  if (candidates.length === 1) return join(result.runDirectory, relative(resolve('test-results'), candidates[0].path));
  throw new Error(`Ambiguous primary page: ${result.title}`);
}
async function customVideo(directory, result, pagePolicy) {
  const location = join(result.runDirectory, directory);
  const videos = (await readdir(location)).filter(filename => filename.endsWith('.webm'));
  if (videos.length === 2 && pagePolicy === 'first-opened-last-closed') {
    // The compact-photo test creates the badge page before the editor, and
    // closes the badge context after closing the editor. Its badge video must
    // therefore be strictly longer. Full-frame QA must confirm the chosen page.
    const timed = videos.map(filename => ({ filename, duration: mediaInfo(join(location, filename)).durationSeconds })).sort((left, right) => right.duration - left.duration);
    if (timed[0].duration - timed[1].duration < 0.2) throw new Error('Ambiguous compact badge/editor page duration');
    return join(location, timed[0].filename);
  }
  if (videos.length !== 1) throw new Error(`Expected exactly one current recording in ${location}`);
  return join(location, videos[0]);
}
function mediaInfo(path) {
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const duration = probe.stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const dimensions = probe.stderr.match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!duration || !dimensions) throw new Error(`Cannot inspect ${path}`);
  return { durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]), width: Number(dimensions[1]), height: Number(dimensions[2]) };
}
await mkdir(join(output, 'raw'), { recursive: true }); await mkdir(join(output, 'qa'));
for (const [index, report] of reports.entries()) await copyFile(join(report.input, 'review-recording-report.json'), join(output, `recording-report-${index}.json`));
await copyFile('.agents/memory/tasks/thr_yumv8gmirt/normal-validation.json', join(output, 'normal-validation.json'));
const frozenSources = new Map();
async function retainSource(path, result) {
  if (frozenSources.has(path)) return frozenSources.get(path);
  const info = await fingerprint(path);
  const savedPath = join(output, 'raw', `${info.sha256}.webm`);
  await copyFile(path, savedPath);
  const retained = { ...info, savedPath, ...mediaInfo(savedPath), sourceSha: result.sourceSha, sourceTree: result.sourceTree, runStartedAt: result.runStartedAt, runDirectory: result.runDirectory, overallRunStatus: result.runStatus, individualTestStatus: result.status, testFile: result.file, testTitle: result.title };
  frozenSources.set(path, retained); return retained;
}
const artifacts = [];
for (const asset of catalog.assets) {
  const destination = join(output, asset.output);
  const cuts = [];
  if (asset.overviewManifest) {
    const result = testResult(asset.staffTest);
    const timeline = JSON.parse(await readFile(join(result.runDirectory, asset.overviewManifest), 'utf8'));
    if (timeline.sourceRevision !== result.sourceSha) throw new Error('Overview source revision mismatch');
    await copyFile(join(result.runDirectory, asset.overviewManifest), join(output, asset.overviewManifest));
    for (const stage of timeline.clips) {
      const path = stage.role === 'staff' ? await primaryVideo(result) : await customVideo(asset.roleDirectories[stage.role], result);
      cuts.push({ ...stage, source: await retainSource(path, result) });
    }
  } else {
    const result = testResult(asset);
    const source = await retainSource(asset.customDirectory ? await customVideo(asset.customDirectory, result) : await primaryVideo(result), result);
    cuts.push({ role: asset.logicalId, stage: asset.coverage, start: 0, end: source.durationSeconds, source });
    if (asset.appendTest) {
      const appendResult = testResult(asset.appendTest);
      const appended = await retainSource(asset.appendTest.customDirectory ? await customVideo(asset.appendTest.customDirectory, appendResult, asset.appendTest.customPagePolicy) : await primaryVideo(appendResult), appendResult);
      cuts.push({ role: 'compact-badge-photo', stage: 'selected photo loading, decoded image, privacy revocation', start: 0, end: appended.durationSeconds, source: appended });
    }
  }
  if (cuts.length === 1 && cuts[0].start === 0 && cuts[0].end === cuts[0].source.durationSeconds) {
    await copyFile(cuts[0].source.savedPath, destination);
  } else {
    const fragments = join(output, 'raw', `${asset.logicalId}-cuts`); await mkdir(fragments);
    const width = asset.appendTest ? 390 : 1100, height = asset.appendTest ? 844 : 760;
    for (const [index, clip] of cuts.entries()) {
      if (!(clip.start >= 0 && clip.end > clip.start && clip.end <= clip.source.durationSeconds + 0.2)) throw new Error('Cut outside source video');
      runFFmpeg(['-loglevel', 'error', '-ss', String(clip.start), '-i', clip.source.savedPath, '-t', String(clip.end - clip.start), '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-an', join(fragments, `${index}.webm`)]);
    }
    await writeFile(join(fragments, 'sequence.txt'), cuts.map((clip, index) => `file '${index}.webm'`).join('\n'));
    runFFmpeg(['-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(fragments, 'sequence.txt'), '-c', 'copy', destination]);
  }
  const info = mediaInfo(destination);
  const decoded = runFFmpeg(['-v', 'error', '-i', destination, '-map', '0:v:0', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats']);
  const frameCounts = [...decoded.stdout.matchAll(/^frame=(\d+)/gm)];
  const frames = Number(frameCounts.at(-1)?.[1]);
  if (!frames) throw new Error('No frames decoded');
  const stills = [];
  for (const [index, seconds] of [Math.min(1, info.durationSeconds / 4), info.durationSeconds / 2, Math.max(0, info.durationSeconds - 1)].entries()) {
    const path = join(output, 'qa', `${asset.logicalId}-${index}.png`);
    runFFmpeg(['-loglevel', 'error', '-ss', String(seconds), '-i', destination, '-frames:v', '1', path]);
    stills.push({ seconds, path });
  }
  artifacts.push({ ...asset, ...await fingerprint(destination), ...info, decodedFrames: frames, fullFrameDecodeExitCode: 0,
    sourceRevisions: [...new Set(cuts.map(clip => clip.source.sourceSha))], productSourceSha: '10083d20578e3e23c96941830ce44c64e6935f41', syntheticData: true, actualApp: true,
    physicalDevice: false, playbackRate: 1, cuts, stills, visualQA: 'PENDING actual frame inspection',
    caption: `Actual app on the integrated stack with shared UI/help; synthetic accounts/events, real Auth/Firestore/APIs. Exact source/run provenance is recorded per input clip. ${cuts.length > 1 ? 'Cuts switch between the listed actual actor/stage recordings at native speed. ' : ''}${asset.osSeams.join(' ')}`,
  });
  console.log(`${asset.logicalId}: ${info.durationSeconds}s; ${frames} decoded frames`);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version: 2, preparedAt: new Date().toISOString(), productSourceSha: '10083d20578e3e23c96941830ce44c64e6935f41', runs: reports.map(report => ({ directory: report.input, sourceSha: report.sourceSha, sourceTree: report.sourceTree, startedAt: report.startedAt, overallStatus: report.status })), acceptance: 'Normal business validation plus individually PASSED complete captures. A partial run is never represented as globally passed.', assetCount: artifacts.length, status: 'PENDING VISUAL QA / NOT RELEASED FOR UPLOAD', artifacts }, null, 2));
console.log(`Saved ${artifacts.length} real-app assets to ${output}; inspect decoded stills and workflow chapters before freezing/upload.`);
