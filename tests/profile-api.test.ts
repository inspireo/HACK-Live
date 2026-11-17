import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { emptyDetails } from '../shared/profile';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from '../server/profile-cleanup';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, projectId, signInFixture } from './fixtures';
import { photoFixture } from './photo-fixture';

let environment: RulesTestEnvironment;
let ownerToken: string;
let otherToken: string;
const uid = 'photo-owner';
before(async () => {
  await clearFixtures();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const memberId of [uid, 'photo-other', 'photo-admin']) await createFixtureUser(memberId);
  await createFixtureUser('photo-unverified', false);
  await fixtureDb.doc('users/photo-admin').set({ role: 'admin' });
  ownerToken = await signInFixture(uid); otherToken = await signInFixture('photo-other');
});
after(async () => { await environment?.cleanup(); });
async function upload(color?: string, shared = false) {
  const fixture = await photoFixture(color);
  const current = (await fixtureDb.doc(`profileDetails/${uid}`).get()).data() || emptyDetails();
  return callIdentity(ownerToken, 'save-profile', { name: 'Photo member', ...current, communityFields: shared ? ['avatarUrl', 'skills'] : [], professional: { ...current.professional, skills: ' TypeScript, typescript,  Team   facilitation ' }, photoUpload: { contentType: fixture.mimeType, base64: fixture.buffer.toString('base64') } });
}
async function getPhoto(url: string, token?: string) {
  return fetch(`http://127.0.0.1:3000${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test('real uploaded bytes stay private; sharing/revocation gates every authenticated read and direct rules deny all', async () => {
  const result = await upload(); assert.equal(result.status, 200, JSON.stringify(result));
  const url = result.data.details.professional.avatarUrl;
  assert.match(url, /^\/api\/identity\/photo\/photo-owner\//);
  assert.equal(result.data.details.professional.skills, 'TypeScript, Team facilitation');
  assert.deepEqual((await fixtureDb.doc(`memberDetails/${uid}`).get()).data(), {});
  const response = await getPhoto(url, ownerToken);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Authorization'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), (await fixtureDb.doc(`profilePhotos/${uid}`).get()).data()!.bytes);
  assert.equal((await getPhoto(url)).status, 401);
  assert.equal((await getPhoto(url, await signInFixture('photo-unverified'))).status, 403);
  assert.equal((await getPhoto(url, otherToken)).status, 404);
  assert.equal((await getPhoto(url, await signInFixture('photo-admin'))).status, 404);
  const anonymous = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal((await getPhoto(url, (await anonymous.json()).idToken)).status, 403);
  for (const memberId of [uid, 'photo-other', 'photo-admin']) {
    const database = environment.authenticatedContext(memberId, { email: `${memberId}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
    await assertFails(getDoc(doc(database, `profilePhotos/${uid}`)));
    await assertFails(getDocs(collection(database, 'profilePhotos')));
    await assertFails(setDoc(doc(database, `profilePhotos/${uid}`), { bytes: 'not trusted' }));
  }
  const current = (await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!;
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Photo member', ...current, communityFields: ['avatarUrl'] })).status, 200);
  assert.equal((await getPhoto(url, otherToken)).status, 200);
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Photo member', ...current, communityFields: [] })).status, 200);
  assert.equal((await getPhoto(url, otherToken)).status, 404);
});

test('every photo caller needs an active profile, including owners; recreated active peers regain selected access', async () => {
  const result = await upload(undefined, true); assert.equal(result.status, 200);
  const url = result.data.details.professional.avatarUrl;
  const profileRef = fixtureDb.doc('profiles/photo-other');
  assert.equal((await getPhoto(url, otherToken)).status, 200);
  for (const state of [undefined, 'deleting', 'deleted']) {
    if (state) await profileRef.set({ state }); else await profileRef.delete();
    const denied = await getPhoto(url, otherToken);
    assert.equal(denied.status, 404, `caller state ${state}`);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.equal(denied.headers.get('vary'), 'Authorization');
    assert.equal(denied.headers.get('x-content-type-options'), 'nosniff');
    // Owning the target cannot bypass its lifecycle boundary either.
    if (state) await fixtureDb.doc(`profiles/${uid}`).set({ state });
    else await fixtureDb.doc(`profiles/${uid}`).delete();
    assert.equal((await getPhoto(url, ownerToken)).status, 404, `owner state ${state}`);
    await fixtureDb.doc(`profiles/${uid}`).set({ name: 'Photo member', state: 'active' });
    await profileRef.set({ name: 'Recreated peer', state: 'active' });
    assert.equal((await getPhoto(url, otherToken)).status, 200);
    assert.equal((await getPhoto(url, ownerToken)).status, 200);
  }
  const current = (await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!;
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Photo member', ...current, communityFields: [] })).status, 200);
  assert.equal((await getPhoto(url, otherToken)).status, 404);
});

test('replace/remove are atomic, old versions and cross-owner/stale references cannot resurrect bytes', async () => {
  const old = (await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!;
  const replaced = await upload('#884433', true); assert.equal(replaced.status, 200);
  const url = replaced.data.details.professional.avatarUrl;
  assert.notEqual(url, old.professional.avatarUrl);
  assert.equal((await getPhoto(old.professional.avatarUrl, ownerToken)).status, 404);
  assert.equal((await getPhoto(url, otherToken)).status, 200);
  assert.equal((await callIdentity(otherToken, 'save-profile', { name: 'Other', ...emptyDetails(), professional: { avatarUrl: url }, communityFields: ['avatarUrl'] })).status, 409);
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Stale', ...old })).status, 409);
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Photo member', ...replaced.data.details, photoUpload: null })).status, 200);
  assert.equal((await fixtureDb.doc(`profilePhotos/${uid}`).get()).exists, false);
  assert.equal((await getPhoto(url, ownerToken)).status, 404);
  assert.equal((await callIdentity(ownerToken, 'save-profile', { name: 'Stale', ...replaced.data.details })).status, 409);
});

test('bad content, size, identity and skill bounds fail without partial source/projection/photo writes', async () => {
  const current = (await fixtureDb.doc(`profileDetails/${uid}`).get()).data()!;
  const payload = { name: 'Photo member', ...current };
  const before = await fixtureDb.doc(`profileDetails/${uid}`).get();
  for (const photoUpload of [{ contentType: 'image/png', base64: Buffer.from('<svg/>').toString('base64') }, { contentType: 'image/svg+xml', base64: 'AAAA' }, { contentType: 'image/png', base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }, { base64: 'AAAA' }, 'not-an-upload']) assert.equal((await callIdentity(ownerToken, 'save-profile', { ...payload, photoUpload })).status, 400);
  for (const skills of [Array.from({ length: 21 }, (_, position) => `s${position}`).join(','), 'x'.repeat(61), 'x'.repeat(501)]) assert.equal((await callIdentity(ownerToken, 'save-profile', { ...payload, professional: { skills } })).status, 400);
  const oversized = await callIdentity(ownerToken, 'save-profile', { ...payload, photoUpload: { contentType: 'image/png', base64: 'A'.repeat(3 * 1024 * 1024 + 1) } });
  assert.equal(oversized.status, 413); assert.match(oversized.data.error, /too large/);
  assert.equal((await callIdentity(undefined, 'save-profile', { ...payload, photoUpload: {} })).status, 401);
  assert.deepEqual((await fixtureDb.doc(`profileDetails/${uid}`).get()).data(), before.data());
  assert.equal((await fixtureDb.doc(`profilePhotos/${uid}`).get()).exists, false);
});

test('deletion hides bytes immediately; actual failure/retry and stale cleanup preserve recreated photos', async () => {
  const result = await upload(); assert.equal(result.status, 200);
  const oldUrl = result.data.details.professional.avatarUrl;
  const manifest = await beginProfileDeletion(fixtureDb, uid);
  const paused = createProfileCleanup(fixtureDb, uid, manifest.attemptId);
  assert.equal((await getPhoto(oldUrl, ownerToken)).status, 404);
  assert.equal((await upload()).status, 409);
  // Real transaction failure after deterministic asset cleanup keeps the job retryable.
  const failing = createProfileCleanup(fixtureDb, uid, manifest.attemptId);
  failing.update(fixtureDb.doc('participants/missing-photo-cleanup'), { name: 'Deleted member' });
  await assert.rejects(failing.finish());
  assert.equal((await fixtureDb.doc(`profilePhotos/${uid}`).get()).exists, true);
  assert.equal((await getPhoto(oldUrl, ownerToken)).status, 404);
  assert.equal((await fixtureDb.doc(`profileDeletionJobs/${uid}`).get()).data()!.attemptId, manifest.attemptId);
  await releaseProfileDeletion(fixtureDb, uid, manifest.attemptId);
  assert.equal((await callIdentity(ownerToken, 'delete-profile')).status, 200);
  assert.equal((await fixtureDb.doc(`profilePhotos/${uid}`).get()).exists, false);
  assert.equal((await callIdentity(ownerToken, 'delete-profile')).status, 200);
  await fixtureDb.doc(`profiles/${uid}`).set({ name: 'Recreated', state: 'active' });
  const fresh = await upload('#334488', true); assert.equal(fresh.status, 200);
  await assert.rejects(paused.finish(), /superseded/);
  assert.equal((await getPhoto(fresh.data.details.professional.avatarUrl, otherToken)).status, 200);
  assert.equal((await getPhoto(oldUrl, ownerToken)).status, 404);
});
