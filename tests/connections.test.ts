import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, projectId, signInFixture } from './fixtures';
import { blockKey, pairKey, queueConnectionCleanup } from '../server/connections';
import { createProfileCleanup } from '../server/profile-cleanup';
import { emptyDetails } from '../shared/profile';

let environment: RulesTestEnvironment;
const tokens: Record<string, string> = {};
const memberDb = (uid: string, verified = true, provider: 'password' | 'anonymous' = 'password') => environment.authenticatedContext(uid, { email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
const operation = (actor: string, action: string, peerUid: string, generation?: string) => callIdentity(tokens[actor], `connections/${action}`, { peerUid, ...(generation ? { generation } : {}) });
const save = (actor: string, connectionFields: string[] = ['phone']) => callIdentity(tokens[actor], 'save-profile', { name: `Synthetic ${actor}`, ...emptyDetails(), contacts: { phone: '555-0101', contactEmail: `${actor}@contact.test`, signal: 'private-signal' }, connectionFields });
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
    assert.deepEqual((await assertSucceeds(getDoc(doc(memberDb(actor), `connectionContacts/${peer}`)))).data(), { phone: '555-0101' });
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
  assert.equal((await callIdentity(tokens.alice, 'save-profile', { name: 'Synthetic alice', ...emptyDetails(), contacts: { contactEmail: 'changed@contact.test', phone: 'private-now' }, connectionFields: ['contactEmail'] })).status, 200);
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
  await fixtureDb.doc('profiles/partial-a').set({ state: 'deleting' }, { merge: true });
  const cleanup = createProfileCleanup(fixtureDb, 'partial-a');
  await queueConnectionCleanup(fixtureDb, 'partial-a', cleanup);
  cleanup.update(fixtureDb.doc('participants/nonexistent-connection-cleanup-target'), { name: 'Deleted member' });
  await assert.rejects(cleanup.finish());
  assert.equal((await fixtureDb.doc('profiles/partial-a').get()).data()!.state, 'deleting');
  await assertFails(getDoc(doc(memberDb('partial-b'), 'connectionContacts/partial-a')));
  // Simulate the observed partial state: canonical pair gone, incoming view
  // deletion not completed. Retry must discover the view independently.
  await fixtureDb.doc('connectionViews/partial-b/peers/partial-a').set({ peerUid: 'partial-a', state: 'accepted', generation: request.data.generation, pairId: pairKey('partial-a', 'partial-b'), requester: 'partial-a', unread: true });
  assert.equal((await callIdentity(tokens['partial-a'], 'delete-profile')).status, 200);
  assert.deepEqual((await fixtureDb.doc('profiles/partial-a').get()).data(), { state: 'deleted' });
  assert.equal((await fixtureDb.doc('connectionViews/partial-b/peers/partial-a').get()).exists, false);
  assert.equal((await fixtureDb.doc('connectionContacts/partial-a').get()).exists, false);
});
