import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, projectId, signInFixture } from './fixtures';
import { blockKey, pairKey, queueConnectionCleanup } from '../server/connections';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from '../server/profile-cleanup';
import { retireSignalContact } from '../server/retired-contacts';
import { emptyDetails } from '../shared/profile';

const execFileAsync = promisify(execFile);
let environment: RulesTestEnvironment;
const tokens: Record<string, string> = {};
const memberDb = (uid: string, verified = true, provider: 'password' | 'anonymous' = 'password') => environment.authenticatedContext(uid, { email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
const operation = (actor: string, action: string, peerUid: string, generation?: string) => callIdentity(tokens[actor], `connections/${action}`, { peerUid, ...(generation ? { generation } : {}) });
const save = (actor: string, connectionFields: string[] = ['phone']) => callIdentity(tokens[actor], 'save-profile', { name: `Synthetic ${actor}`, ...emptyDetails(), contacts: { phone: '+6581234567', contactEmail: `${actor}@contact.test`, signal: 'private-signal' }, connectionFields });
before(async () => {
  await clearFixtures();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const uid of ['alice', 'bob', 'carol', 'outsider', 'deletion', 'race-save', 'race-accept', 'unverified-connection']) {
    await createFixtureUser(uid, uid !== 'unverified-connection'); tokens[uid] = await signInFixture(uid);
  }
  for (const uid of ['alice', 'bob', 'carol', 'deletion', 'race-save', 'race-accept']) assert.equal((await save(uid)).status, 200);
});
after(async () => { await environment?.cleanup(); });

test('all direct relation/contact writes and unrelated reads/lists fail, including admin; verified API identity only', async () => {
  await fixtureDb.doc('users/outsider').set({ role: 'admin' });
  for (const database of [environment.unauthenticatedContext().firestore(), memberDb('alice', false, 'anonymous'), memberDb('alice', false), memberDb('outsider'), memberDb('alice')]) {
    for (const path of ['connectionPairs/forged', 'connectionBlocks/bob/targets/forged', 'connectionViews/bob/peers/alice', 'connectionContacts/bob']) {
      await assertFails(getDoc(doc(database, path)));
      await assertFails(setDoc(doc(database, path), { state: 'accepted', generation: 'forged', phone: 'leak' }));
    }
    await assertFails(getDocs(collection(database, 'connectionContacts')));
    await assertFails(getDocs(collection(database, 'connectionPairs')));
    await assertFails(getDocs(collection(database, 'connectionViews/bob/peers')));
  }
  assert.equal((await operation('unverified-connection', 'request', 'alice')).status, 403);
  assert.equal((await callIdentity(undefined, 'connections/request', { peerUid: 'bob' })).status, 401);
  const anonymousResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const anonymous = await anonymousResponse.json();
  assert.equal((await callIdentity(anonymous.idToken, 'connections/request', { peerUid: 'bob' })).status, 403);
  assert.equal((await callIdentity(tokens.alice, 'connections/request', { peerUid: 'bob', requester: 'bob' })).status, 400);
  assert.equal((await operation('alice', 'request', 'alice')).status, 400);
  assert.equal((await operation('alice', 'accept', 'bob', 'forged')).status, 409);
  const invalid = { name: 'Bad', ...emptyDetails(), contacts: { phone: 'safe', uid: 'bob' }, connectionFields: ['phone'] };
  assert.equal((await callIdentity(tokens.alice, 'save-profile', invalid)).status, 400);
  assert.equal((await callIdentity(tokens.alice, 'save-profile', { name: 'Bad', ...emptyDetails(), connectionFields: ['role'] })).status, 400);
  // Merely sharing an event or a team is never a connection grant.
  for (const uid of ['alice', 'bob']) await fixtureDb.doc(`participants/same-team-${uid}`).set({ uid, memberId: uid, sessionId: 'same-event', teamId: 'same-team' });
  await assertFails(getDoc(doc(memberDb('alice'), 'connectionContacts/bob')));
});

test('duplicates and simultaneous opposite requests create exactly one pending generation; only recipient accepts', async () => {
  // Existing PR2 canonical selections have no contact projection yet.
  await fixtureDb.doc('connectionContacts/alice').delete();
  await fixtureDb.doc('connectionContacts/bob').delete();
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => operation(index % 2 ? 'bob' : 'alice', 'request', index % 2 ? 'alice' : 'bob')));
  assert.ok(attempts.every(result => result.status === 200), JSON.stringify(attempts));
  assert.equal(new Set(attempts.map(result => result.data.generation)).size, 1);
  assert.ok(attempts.every(result => result.data.state === 'pending'));
  const generation = attempts[0].data.generation;
  const requester = attempts[0].data.requester;
  const recipient = requester === 'alice' ? 'bob' : 'alice';
  assert.equal((await fixtureDb.collection('connectionPairs').get()).size, 1);
  assert.equal((await operation('outsider', 'inspect', 'alice')).data.state, 'none');
  assert.deepEqual((await getDocs(collection(memberDb('outsider'), 'connectionViews/outsider/peers'))).docs, []);
  await assertFails(getDoc(doc(memberDb('alice'), 'connectionContacts/bob')));
  const inspect = await operation(recipient, 'inspect', requester);
  assert.deepEqual(inspect.data.peerFields, ['phone']); assert.ok(!('contacts' in inspect.data));
  for (const action of ['accept', 'decline']) assert.equal((await operation(requester, action, recipient, generation)).status, 409);
  assert.equal((await operation(recipient, 'cancel', requester, generation)).status, 409);
  assert.equal((await operation('outsider', 'accept', requester, generation)).status, 409);
  assert.equal((await operation(recipient, 'accept', requester, generation)).status, 200);
  for (const [actor, peer] of [['alice', 'bob'], ['bob', 'alice']]) {
    assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(actor), `connectionContacts/${peer}`)))).data(), { phone: '+6581234567' });
    await assertFails(getDoc(doc(memberDb(actor), `profileDetails/${peer}`)));
  }
  assert.equal((await fixtureDb.doc(`connectionViews/${requester}/peers/${recipient}`).get()).data()!.unread, true);
  assert.equal((await operation(requester, 'seen', recipient, generation)).status, 200);
  assert.equal((await fixtureDb.doc(`connectionViews/${requester}/peers/${recipient}`).get()).data()!.unread, false);
  await assertFails(getDoc(doc(memberDb('outsider'), 'connectionContacts/alice')));
});

test('global selection changes apply to every accepted peer, including empty selection; unfriend revokes both directions', async () => {
  const request = await operation('alice', 'request', 'carol');
  assert.equal((await operation('carol', 'accept', 'alice', request.data.generation)).status, 200);
  assert.equal((await save('alice', ['contactEmail'])).status, 200);
  for (const peer of ['bob', 'carol']) assert.deepEqual((await getDoc(doc(memberDb(peer), 'connectionContacts/alice'))).data(), { contactEmail: 'alice@contact.test' });
  assert.equal((await callIdentity(tokens.alice, 'save-profile', { name: 'Synthetic alice', ...emptyDetails(), contacts: { contactEmail: 'changed@contact.test', phone: '+6587654321' }, connectionFields: ['contactEmail'] })).status, 200);
  for (const peer of ['bob', 'carol']) assert.deepEqual((await getDoc(doc(memberDb(peer), 'connectionContacts/alice'))).data(), { contactEmail: 'changed@contact.test' });
  assert.equal((await save('alice', [])).status, 200);
  assert.deepEqual((await getDoc(doc(memberDb('bob'), 'connectionContacts/alice'))).data(), {});
  assert.equal((await save('alice', ['phone'])).status, 200);
  const old = (await fixtureDb.doc(`connectionPairs/${pairKey('alice', 'bob')}`).get()).data()!;
  assert.equal((await operation('bob', 'unfriend', 'alice', old.generation)).status, 200);
  for (const [actor, peer] of [['alice', 'bob'], ['bob', 'alice']]) await assertFails(getDoc(doc(memberDb(actor), `connectionContacts/${peer}`)));
  assert.equal((await operation('bob', 'accept', 'alice', old.generation)).status, 409);
});

test('rules require canonical acceptance, exact membership and both current-generation mirrors', async () => {
  const reference = fixtureDb.doc(`connectionPairs/${pairKey('alice', 'carol')}`);
  const original = (await reference.get()).data()!;
  for (const changes of [{ state: 'blocked' }, { generation: 'stale' }, { members: ['alice', 'outsider'] }]) {
    await reference.set({ ...original, ...changes });
    await assertFails(getDoc(doc(memberDb('carol'), 'connectionContacts/alice')));
    await reference.set(original);
  }
  const peerReference = fixtureDb.doc('connectionViews/alice/peers/carol');
  const originalView = (await peerReference.get()).data()!;
  for (const changes of [{ generation: 'stale' }, { state: 'removed' }, { pairId: 'unrelated' }]) {
    await peerReference.set({ ...originalView, ...changes });
    await assertFails(getDoc(doc(memberDb('carol'), 'connectionContacts/alice')));
  }
  await peerReference.set(originalView);
  await assertSucceeds(getDoc(doc(memberDb('carol'), 'connectionContacts/alice')));
});

test('cancel/decline, stale generations and accept/cancel races cannot revive approval; block is unilateral', async () => {
  let request = await operation('alice', 'request', 'bob');
  const stale = request.data.generation;
  assert.equal((await operation('alice', 'cancel', 'bob', stale)).status, 200);
  assert.equal((await operation('bob', 'accept', 'alice', stale)).status, 409);
  request = await operation('alice', 'request', 'bob');
  assert.notEqual(request.data.generation, stale);
  assert.equal((await operation('bob', 'accept', 'alice', stale)).status, 409);
  assert.equal((await operation('bob', 'decline', 'alice', request.data.generation)).status, 200);
  await assertFails(getDoc(doc(memberDb('bob'), 'connectionContacts/alice')));
  request = await operation('alice', 'request', 'bob');
  const race = await Promise.all([operation('bob', 'accept', 'alice', request.data.generation), operation('alice', 'cancel', 'bob', request.data.generation)]);
  assert.equal(race.filter(result => result.status === 200).length, 1, JSON.stringify(race));
  assert.equal((await operation('alice', 'block', 'bob')).status, 200);
  for (const [actor, peer] of [['alice', 'bob'], ['bob', 'alice']]) {
    await assertFails(getDoc(doc(memberDb(actor), `connectionContacts/${peer}`)));
    assert.equal((await operation(actor, 'request', peer)).status, 409);
    assert.equal((await operation(actor, 'accept', peer, request.data.generation)).status, 409);
  }
  assert.deepEqual((await fixtureDb.doc(`connectionBlocks/alice/targets/${blockKey('bob')}`).get()).data(), {});
  await assertFails(getDoc(doc(memberDb('bob'), `connectionBlocks/alice/targets/${blockKey('bob')}`)));
  // No contact fields ever enter the name or professional projection.
  assert.deepEqual(Object.keys((await fixtureDb.doc('profiles/alice').get()).data()!).sort(), ['name', 'state']);
  assert.deepEqual((await fixtureDb.doc('memberDetails/alice').get()).data(), {});
});

test('mark-deleting immediately revokes access; accept/save racing deletion never resurrect data; retry cleanup preserves other safety preference', async () => {
  const request = await operation('deletion', 'request', 'carol');
  assert.equal((await operation('carol', 'accept', 'deletion', request.data.generation)).status, 200);
  assert.equal((await operation('bob', 'block', 'deletion')).status, 200);
  await fixtureDb.doc('profiles/deletion').set({ state: 'deleting' }, { merge: true });
  await assertFails(getDoc(doc(memberDb('carol'), 'connectionContacts/deletion')));
  await assertFails(getDoc(doc(memberDb('deletion'), 'connectionContacts/carol')));
  assert.equal((await save('deletion')).status, 409);
  assert.equal((await operation('deletion', 'request', 'bob')).status, 409);
  assert.equal((await callIdentity(tokens.deletion, 'delete-profile')).status, 200);
  for (const collectionName of ['connectionContacts', 'profileDetails', 'memberDetails']) assert.equal((await fixtureDb.doc(`${collectionName}/deletion`).get()).exists, false);
  assert.equal((await fixtureDb.collectionGroup('peers').where('peerUid', '==', 'deletion').get()).size, 0);
  assert.equal((await fixtureDb.collection('connectionPairs').where('members', 'array-contains', 'deletion').get()).size, 0);
  assert.deepEqual((await fixtureDb.doc(`connectionBlocks/bob/targets/${blockKey('deletion')}`).get()).data(), {});
  await assertSucceeds(setDoc(doc(memberDb('deletion'), 'profiles/deletion'), { name: 'Recreated', state: 'active' }));
  assert.equal((await operation('deletion', 'request', 'bob')).status, 409);
  assert.equal((await operation('carol', 'accept', 'deletion', request.data.generation)).status, 409);
  const pending = await operation('race-accept', 'request', 'carol');
  const results = await Promise.all([operation('carol', 'accept', 'race-accept', pending.data.generation), callIdentity(tokens['race-accept'], 'delete-profile'), save('race-save'), callIdentity(tokens['race-save'], 'delete-profile')]);
  assert.equal(results[1].status, 200); assert.equal(results[3].status, 200);
  for (const uid of ['race-save', 'race-accept']) {
    assert.equal((await fixtureDb.doc(`profiles/${uid}`).get()).data()!.state, 'deleted');
    assert.equal((await fixtureDb.doc(`connectionContacts/${uid}`).get()).exists, false);
    assert.equal((await fixtureDb.doc(`profileDetails/${uid}`).get()).exists, false);
  }
  await assertFails(getDoc(doc(memberDb('carol'), 'connectionContacts/race-accept')));
});

test('accept racing block ends blocked with both reads denied, regardless of transaction order', async () => {
  for (const uid of ['block-race-a', 'block-race-b']) { await createFixtureUser(uid); tokens[uid] = await signInFixture(uid); assert.equal((await save(uid)).status, 200); }
  const request = await operation('block-race-a', 'request', 'block-race-b');
  const results = await Promise.all([operation('block-race-b', 'accept', 'block-race-a', request.data.generation), operation('block-race-a', 'block', 'block-race-b')]);
  assert.equal(results[1].status, 200);
  assert.ok([200, 409].includes(results[0].status));
  for (const [actor, peer] of [['block-race-a', 'block-race-b'], ['block-race-b', 'block-race-a']]) await assertFails(getDoc(doc(memberDb(actor), `connectionContacts/${peer}`)));
  assert.equal((await operation('block-race-b', 'accept', 'block-race-a', request.data.generation)).status, 409);
});

test('real partial cleanup failure keeps deleting; authenticated retry removes remaining pair/view/contact state', async () => {
  for (const uid of ['partial-a', 'partial-b']) { await createFixtureUser(uid); tokens[uid] = await signInFixture(uid); assert.equal((await save(uid)).status, 200); }
  const request = await operation('partial-a', 'request', 'partial-b');
  assert.equal((await operation('partial-b', 'accept', 'partial-a', request.data.generation)).status, 200);
  const manifest = await beginProfileDeletion(fixtureDb, 'partial-a');
  const cleanup = createProfileCleanup(fixtureDb, 'partial-a', manifest.attemptId);
  await queueConnectionCleanup(fixtureDb, 'partial-a', cleanup);
  // Commit one real bounded batch, then fail a later one.
  for (let index = 0; index < 110; index++) cleanup.delete(fixtureDb.doc(`connectionViews/partial-a/peers/obsolete-${index}`));
  cleanup.update(fixtureDb.doc('participants/nonexistent-connection-cleanup-target'), { name: 'Deleted member' });
  await assert.rejects(cleanup.finish());
  assert.equal((await fixtureDb.doc('profiles/partial-a').get()).data()!.state, 'deleting');
  await assertFails(getDoc(doc(memberDb('partial-b'), 'connectionContacts/partial-a')));
  assert.equal((await fixtureDb.doc(`connectionPairs/${pairKey('partial-a', 'partial-b')}`).get()).exists, false);
  await releaseProfileDeletion(fixtureDb, 'partial-a', manifest.attemptId);
  // Simulate a surviving independently discoverable incoming view: canonical pair gone, incoming view
  // deletion not completed. Retry must discover the view independently.
  await fixtureDb.doc('connectionViews/partial-b/peers/partial-a').set({ peerUid: 'partial-a', state: 'accepted', generation: request.data.generation, pairId: pairKey('partial-a', 'partial-b'), requester: 'partial-a', unread: true });
  assert.equal((await callIdentity(tokens['partial-a'], 'delete-profile')).status, 200);
  assert.deepEqual((await fixtureDb.doc('profiles/partial-a').get()).data(), { state: 'deleted' });
  assert.equal((await fixtureDb.doc('connectionViews/partial-b/peers/partial-a').get()).exists, false);
  assert.equal((await fixtureDb.doc('connectionContacts/partial-a').get()).exists, false);
});

test('stale deletion workers discovering before or after recreation cannot erase new contacts, same-pair generations, views or safety preferences', async () => {
  const uid = 'connection-takeover';
  const peer = 'connection-takeover-peer';
  const safetyOwner = 'connection-takeover-safety';
  const ownBlockTarget = 'connection-takeover-target';
  for (const member of [uid, peer, safetyOwner, ownBlockTarget]) {
    await createFixtureUser(member); tokens[member] = await signInFixture(member);
    assert.equal((await save(member)).status, 200);
  }
  const oldRequest = await operation(uid, 'request', peer);
  assert.equal((await operation(peer, 'accept', uid, oldRequest.data.generation)).status, 200);
  assert.equal((await operation(safetyOwner, 'block', uid)).status, 200);
  const first = await beginProfileDeletion(fixtureDb, uid);
  const earlyWorker = createProfileCleanup(fixtureDb, uid, first.attemptId);
  await queueConnectionCleanup(fixtureDb, uid, earlyWorker);
  await fixtureDb.doc(`profileDeletionJobs/${uid}`).update({ leaseUntil: 0 });
  assert.equal((await callIdentity(tokens[uid], 'delete-profile')).status, 200);
  await assertSucceeds(setDoc(doc(memberDb(uid), `profiles/${uid}`), { name: 'Recreated connection owner', state: 'active' }));
  const fresh = { name: 'Recreated connection owner', ...emptyDetails(), professional: { title: 'Fresh professional details' }, communityFields: ['title'], contacts: { contactEmail: 'fresh-takeover@contact.test', phone: '+6587654321' }, connectionFields: ['contactEmail'] };
  assert.equal((await callIdentity(tokens[uid], 'save-profile', fresh)).status, 200);
  const newRequest = await operation(uid, 'request', peer);
  assert.notEqual(newRequest.data.generation, oldRequest.data.generation);
  assert.equal((await operation(peer, 'accept', uid, newRequest.data.generation)).status, 200);
  assert.equal((await operation(uid, 'block', ownBlockTarget)).status, 200);
  // A second stale worker performs discovery AFTER recreation. Neither stale
  // reference snapshots nor fresh queries can bypass the per-batch job fence.
  const lateWorker = createProfileCleanup(fixtureDb, uid, first.attemptId);
  await queueConnectionCleanup(fixtureDb, uid, lateWorker);
  const beforePaths = [
    `profiles/${uid}`, `profileDetails/${uid}`, `memberDetails/${uid}`, `connectionContacts/${uid}`,
    `connectionPairs/${pairKey(uid, peer)}`, `connectionViews/${uid}/peers/${peer}`, `connectionViews/${peer}/peers/${uid}`,
    `connectionPairs/${pairKey(uid, ownBlockTarget)}`, `connectionViews/${uid}/peers/${ownBlockTarget}`, `connectionViews/${ownBlockTarget}/peers/${uid}`,
    `connectionBlocks/${uid}/targets/${blockKey(ownBlockTarget)}`, `connectionBlocks/${safetyOwner}/targets/${blockKey(uid)}`,
  ];
  const beforeData = await Promise.all(beforePaths.map(async path => (await fixtureDb.doc(path).get()).data()));
  assert.ok(beforeData.every(record => record !== undefined));
  await assert.rejects(earlyWorker.finish(), /superseded/);
  await assert.rejects(lateWorker.finish(), /superseded/);
  await releaseProfileDeletion(fixtureDb, uid, first.attemptId);
  const afterData = await Promise.all(beforePaths.map(async path => (await fixtureDb.doc(path).get()).data()));
  assert.deepEqual(afterData, beforeData);
  assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(peer), `connectionContacts/${uid}`)))).data(), { contactEmail: 'fresh-takeover@contact.test' });
  assert.equal((await operation(peer, 'accept', uid, oldRequest.data.generation)).status, 409);
  assert.equal((await operation(uid, 'request', safetyOwner)).status, 409);
  assert.equal((await fixtureDb.doc(`profileDeletionJobs/${uid}`).get()).exists, false);
});


async function acceptedFixture(owner: string, peer: string) {
  for (const uid of [owner, peer]) { await createFixtureUser(uid); tokens[uid] = await signInFixture(uid); assert.equal((await save(uid)).status, 200); }
  const request = await operation(owner, 'request', peer);
  assert.equal(request.status, 200);
  assert.equal((await operation(peer, 'accept', owner, request.data.generation)).status, 200);
  return request.data.generation as string;
}

test('old clients cannot read any retired Signal key; dry-run is inert and trusted cleanup restores only existing allowed access', async () => {
  const owner = 'retired-owner', peer = 'retired-peer';
  const generation = await acceptedFixture(owner, peer);
  const reference = fixtureDb.doc(`connectionContacts/${owner}`);
  const sourceBefore = (await fixtureDb.doc(`profileDetails/${owner}`).get()).data();
  for (const signal of ['retired-secret', '', null, { malformed: true }]) {
    const mixed = { phone: '+6581234567', signal };
    await reference.set(mixed);
    // This is an unfiltered direct Firestore get, equivalent to an old client.
    await assertFails(getDoc(doc(memberDb(peer), reference.path)));
    assert.equal(await retireSignalContact(fixtureDb, owner), 'candidate');
    assert.deepEqual((await reference.get()).data(), mixed);
    assert.equal(await retireSignalContact(fixtureDb, owner, true), 'retired');
    assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(peer), reference.path)))).data(), { phone: '+6581234567' });
    assert.equal(await retireSignalContact(fixtureDb, owner, true), 'clean');
  }
  await reference.set({ signal: 'only-retired' });
  await retireSignalContact(fixtureDb, owner, true);
  assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(peer), reference.path)))).data(), {});
  await reference.set({ phone: '+6581234567', signal: 'retired', futureContact: { private: 'preserve' } });
  await retireSignalContact(fixtureDb, owner, true);
  assert.deepEqual((await reference.get()).data(), { phone: '+6581234567', futureContact: { private: 'preserve' } });
  await assertFails(getDoc(doc(memberDb(peer), reference.path)));
  await assertFails(getDoc(doc(memberDb(owner), reference.path)));
  await assertFails(getDoc(doc(memberDb('outsider'), reference.path)));
  assert.deepEqual((await fixtureDb.doc(`profileDetails/${owner}`).get()).data(), sourceBefore);
  await reference.set({ phone: '+6581234567' });
  assert.equal((await operation(peer, 'unfriend', owner, generation)).status, 200);
  await assertFails(getDoc(doc(memberDb(peer), reference.path)));
});

test('legacy source sanitizes inspect/accept without validation failure and linked WhatsApp never grants mobile sharing', async () => {
  const owner = 'legacy-source-owner', peer = 'legacy-source-peer';
  for (const uid of [owner, peer]) { await createFixtureUser(uid); tokens[uid] = await signInFixture(uid); }
  const legacy = { ...emptyDetails(), professional: { skills: 'x'.repeat(600) }, contacts: { phone: 'legacy-local', telegram: 'invalid-old-link', signal: { retired: true }, whatsapp: 'stale' }, connectionFields: ['signal', 'whatsapp', 'telegram'], whatsappUsesMobile: true };
  await fixtureDb.doc(`profileDetails/${owner}`).set(legacy);
  const request = await operation(owner, 'request', peer);
  assert.equal(request.status, 200);
  const inspected = await operation(peer, 'inspect', owner);
  assert.equal(inspected.status, 200);
  assert.deepEqual(inspected.data.peerFields, ['telegram', 'whatsapp']);
  assert.equal(JSON.stringify(inspected.data).includes('legacy-local'), false);
  assert.equal((await operation(peer, 'accept', owner, request.data.generation)).status, 200);
  assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(peer), `connectionContacts/${owner}`)))).data(), { telegram: 'invalid-old-link', whatsapp: 'legacy-local' });
  assert.deepEqual((await fixtureDb.doc(`profileDetails/${owner}`).get()).data(), legacy);
  const payload = { name: 'Corrected', ...emptyDetails(), contacts: { phone: '+65 8123 4567', signal: 'retired', whatsapp: 'ignored' }, whatsappUsesMobile: true, connectionFields: ['signal', 'whatsapp'] };
  assert.equal((await callIdentity(tokens[owner], 'save-profile', payload)).status, 200);
  assert.deepEqual((await fixtureDb.doc(`connectionContacts/${owner}`).get()).data(), { whatsapp: '+6581234567' });
  assert.equal((await callIdentity(tokens[owner], 'save-profile', { ...payload, contacts: { phone: '+1 202 555 0199' } })).status, 200);
  assert.deepEqual((await getDoc(doc(memberDb(peer), `connectionContacts/${owner}`))).data(), { whatsapp: '+12025550199' });
});

test('retired cleanup preserves concurrent new fields and serializes with canonical Save and accept', async () => {
  const owner = 'migration-race-owner', peer = 'migration-race-peer';
  await acceptedFixture(owner, peer);
  const reference = fixtureDb.doc(`connectionContacts/${owner}`);
  await reference.set({ signal: 'retired', phone: '+6581234567' });
  // Real competing emulator transactions/writes, rather than mocked transforms.
  await Promise.all([retireSignalContact(fixtureDb, owner, true), reference.set({ phone: '+12025550199', futureContact: { concurrent: 'keep' } }, { merge: true })]);
  assert.deepEqual((await reference.get()).data(), { phone: '+12025550199', futureContact: { concurrent: 'keep' } });
  await reference.set({ signal: 'retired', phone: '+6581234567' });
  const saved = await Promise.all([retireSignalContact(fixtureDb, owner, true), callIdentity(tokens[owner], 'save-profile', { name: 'Fresh save', ...emptyDetails(), contacts: { contactEmail: 'new@contact.test' }, connectionFields: ['contactEmail'] })]);
  assert.equal(saved[1].status, 200);
  assert.deepEqual((await reference.get()).data(), { contactEmail: 'new@contact.test' });
  const oldPair = (await fixtureDb.doc(`connectionPairs/${pairKey(owner, peer)}`).get()).data()!;
  assert.equal((await operation(peer, 'unfriend', owner, oldPair.generation)).status, 200);
  const request = await operation(owner, 'request', peer);
  await reference.set({ signal: 'retired', contactEmail: 'stale@contact.test' });
  const accepted = await Promise.all([retireSignalContact(fixtureDb, owner, true), operation(peer, 'accept', owner, request.data.generation)]);
  assert.equal(accepted[1].status, 200);
  assert.deepEqual((await reference.get()).data(), { contactEmail: 'new@contact.test' });
});

test('stale migration discovery never resurrects deleted projections or clobbers recreated profile state', async () => {
  const owner = 'migration-recreation', peer = 'migration-recreation-peer';
  await acceptedFixture(owner, peer);
  const reference = fixtureDb.doc(`connectionContacts/${owner}`);
  await reference.set({ signal: 'old-retired', phone: '+6581234567' });
  const discovered = await fixtureDb.collection('connectionContacts').get();
  assert.ok(discovered.docs.some(record => record.id === owner));
  assert.equal((await callIdentity(tokens[owner], 'delete-profile')).status, 200);
  assert.equal(await retireSignalContact(fixtureDb, owner, true), 'missing');
  assert.equal((await reference.get()).exists, false);
  await fixtureDb.doc(`profiles/${owner}`).set({ name: 'New incarnation', state: 'active' });
  assert.equal((await callIdentity(tokens[owner], 'save-profile', { name: 'New incarnation', ...emptyDetails(), contacts: { contactEmail: 'new-incarnation@contact.test' }, connectionFields: ['contactEmail'] })).status, 200);
  const paths = [`profiles/${owner}`, `profileDetails/${owner}`, `memberDetails/${owner}`, reference.path];
  const beforeData = await Promise.all(paths.map(async path => (await fixtureDb.doc(path).get()).data()));
  assert.equal(await retireSignalContact(fixtureDb, owner, true), 'clean');
  assert.deepEqual(await Promise.all(paths.map(async path => (await fixtureDb.doc(path).get()).data())), beforeData);
  await assertFails(getDoc(doc(memberDb(peer), reference.path)));
  // A deleting profile retains its cleanup authority; migration never writes it.
  await reference.update({ signal: 'retired' });
  await fixtureDb.doc(`profiles/${owner}`).update({ state: 'deleting' });
  assert.equal(await retireSignalContact(fixtureDb, owner, true), 'inactive');
  assert.equal((await reference.get()).data()!.signal, 'retired');
  await reference.delete();
  assert.equal(await retireSignalContact(fixtureDb, owner, true), 'missing');
});


test('synthetic migration CLI defaults to dry-run, applies delete-only cleanup and is repeatable without logging contacts', async () => {
  const owner = 'migration-cli';
  await createFixtureUser(owner);
  const reference = fixtureDb.doc(`connectionContacts/${owner}`);
  const mixed = { phone: '+6581234567', signal: 'CLI-PRIVATE-RETIRED', futureContact: { preserve: true } };
  await reference.set(mixed);
  const runMigration = async (args: string[] = []) => {
    const result = await execFileAsync(process.execPath, ['--import', 'tsx', 'scripts/retire-signal-contacts.ts', ...args], { env: { ...process.env, GCLOUD_PROJECT: projectId } });
    assert.equal(result.stdout.includes('CLI-PRIVATE-RETIRED'), false);
    assert.equal(result.stdout.includes('+6581234567'), false);
    return JSON.parse(result.stdout.trim());
  };
  const dryRun = await runMigration();
  assert.equal(dryRun.mode, 'dry-run'); assert.ok(dryRun.counts.candidate >= 1);
  assert.deepEqual((await reference.get()).data(), mixed);
  const applied = await runMigration(['--apply']);
  assert.equal(applied.mode, 'apply'); assert.ok(applied.counts.retired >= 1);
  assert.deepEqual((await reference.get()).data(), { phone: '+6581234567', futureContact: { preserve: true } });
  const repeated = await runMigration(['--apply']);
  assert.equal(repeated.counts.retired, 0);
});
