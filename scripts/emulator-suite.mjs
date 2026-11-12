import { spawn } from 'node:child_process';
const suiteEnv = { ...process.env, IDENTITY_EMULATORS: 'true', VITE_IDENTITY_EMULATORS: 'true', DISABLE_HMR: 'true', GCLOUD_PROJECT: 'demo-hack-live' };
if (!suiteEnv.FIRESTORE_EMULATOR_HOST || !suiteEnv.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run via npm run test:emulators');
const server = spawn('node', ['--import', 'tsx', 'server.ts'], { env: suiteEnv, stdio: 'inherit' });
async function run(command, args) {
  const processHandle = spawn(command, args, { env: suiteEnv, stdio: 'inherit' });
  const exitCode = await new Promise(resolve => processHandle.on('exit', resolve));
  if (exitCode !== 0) throw new Error(`${command} ${args.join(' ')} exited ${exitCode}`);
}
try {
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { healthy = (await fetch('http://127.0.0.1:3000/api/health')).ok; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!healthy) throw new Error('App did not start');
  // Evidence-only reruns keep the exact real app/emulator/fixture lifecycle.
  // Default CI/normal execution below always retains the full serial suite.
  if (process.env.AWARDS_DEMO === 'true' && process.env.AWARDS_RECORD_ONLY === 'true') {
    await run('npx', ['playwright', 'test', 'tests/browser/awards-journey.spec.ts']);
  } else {
  await run('node', ['--import', 'tsx', '--test', 'tests/profile-pure.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/eventInvitation.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/connections-pure.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/participation-pure.test.ts']);
  await run('node', ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/identity.test.ts', 'tests/connections.test.ts', 'tests/participation.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/attendance-pure.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/attendance.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/shared-cleanup.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/awards-pure.test.ts']);
  await run('node', ['--import', 'tsx', '--test', 'tests/awards.test.ts']);
  await run('npx', ['playwright', 'test']);
  }
} catch (issue) { console.error(issue); process.exitCode = 1; }
finally { server.kill('SIGTERM'); }
