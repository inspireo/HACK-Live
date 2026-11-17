import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { clearFixtures, createFixtureUser, fixtureDb, seedEvents, signInFixture, callIdentity, projectId } from './fixtures';
import { invitationRequest, publicFields, publishFixture } from './invitation-fixtures';
import { isEventDeleted } from '../shared/eventLifecycle';
let environment: RulesTestEnvironment;
const eventPath = '/api/identity/events/event-one';
const sdk = (uid: string) => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
const remove = async (uid = 'organizer') => invitationRequest(`${eventPath}/soft-delete`, await signInFixture(uid), {});
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await clearFixtures(); await seedEvents();
  for (const uid of ['organizer', 'coadmin', 'member', 'platform', 'newcomer']) await createFixtureUser(uid);
  await createFixtureUser('unverified', false);
  await fixtureDb.doc('users/platform').set({ role: 'admin' });
});
after(async () => { await environment?.cleanup(); });

test('client hard deletion and lifecycle forgery denied including all organizers; legacy stays active', async () => {
  for (const uid of ['organizer', 'platform', 'coadmin']) {
    const database = sdk(uid), reference = doc(database, 'sessions/event-one');
    await assertFails(deleteDoc(reference));
    await assertFails(updateDoc(reference, { deletedAt: 1, deletedBy: uid }));
    for (const field of ['deletedAt', 'deletedBy']) await assertFails(setDoc(doc(database, 'sessions', `forged-${field}-${uid}`), { ownerId: uid, [field]: null }));
  }
  await assertSucceeds(updateDoc(doc(sdk('organizer'), 'sessions/event-one'), { title: 'Legacy still active' }));
  assert.equal(isEventDeleted((await fixtureDb.doc('sessions/event-one').get()).data()), false);
});

test('verified current organizer authority only, without social profile; idempotent trusted marker', async () => {
  assert.equal((await invitationRequest(`${eventPath}/soft-delete`, undefined, {})).status, 401);
  for (const uid of ['unverified', 'member']) assert.equal((await remove(uid)).status, 403);
  await fixtureDb.doc('sessionAccess/event-one').update({ adminEmails: [] });
  assert.equal((await remove('coadmin')).status, 403);
  assert.equal((await fixtureDb.doc('sessions/event-one').get()).data()!.deletedAt, undefined);
  await fixtureDb.doc('profiles/organizer').delete();
  assert.equal((await invitationRequest(`${eventPath}/soft-delete`, await signInFixture('organizer'), { deletedAt: 1 })).status, 400);
  assert.equal((await remove()).status, 200);
  const original = (await fixtureDb.doc('sessions/event-one').get()).data()!;
  assert.equal(original.deletedBy, 'organizer'); assert.ok(original.deletedAt.toMillis() > 0);
  assert.equal((await remove()).status, 200);
  assert.deepEqual((await fixtureDb.doc('sessions/event-one').get()).data(), original);
  for (const uid of ['platform', 'coadmin']) {
    await fixtureDb.doc('sessions/event-two').set({ ownerId: 'organizer', status: 'Draft' });
    await fixtureDb.doc(`profiles/${uid}`).delete();
    assert.equal((await invitationRequest('/api/identity/events/event-two/soft-delete', await signInFixture(uid), {})).status, 200);
    assert.equal((await fixtureDb.doc('sessions/event-two').get()).data()!.deletedBy, uid);
  }
});

test('all invitation surfaces, reused/new registration and stale publication fail closed', async () => {
  const owner = await signInFixture('organizer'), member = await signInFixture('member');
  const registration = await callIdentity(member, 'register', { sessionId: 'event-one' }); assert.equal(registration.status, 200);
  const published = await publishFixture(), original = (await fixtureDb.doc('eventPublications/event-one').get()).data();
  assert.equal((await remove()).status, 200);
  for (const suffix of ['', '/calendar.ics']) assert.equal((await invitationRequest(`/api/invitations/${published.token}${suffix}`)).status, 404);
  assert.equal((await invitationRequest(`/api/identity/invitations/${published.token}/destination`, member, {})).status, 404);
  for (const suffix of ['/invitation', '/publication']) assert.equal((await invitationRequest(eventPath + suffix, owner)).status, 404);
  for (const action of ['publish', 'renew', 'unpublish', 'revoke']) assert.equal((await invitationRequest(`${eventPath}/publication/${action}`, owner, { revision: published.revision, ...(action === 'publish' ? { fields: publicFields } : {}) })).status, 404);
  for (const uid of ['member', 'newcomer']) assert.equal((await callIdentity(await signInFixture(uid), 'register', { sessionId: 'event-one' })).status, 404);
  assert.deepEqual((await fixtureDb.doc('eventPublications/event-one').get()).data(), original);
  assert.ok((await fixtureDb.doc(`participants/${registration.data.participantId}`).get()).exists);
  assert.equal((await callIdentity(owner, 'remove-registration', { sessionId: 'event-one', participantId: registration.data.participantId })).status, 404);
});

test('retains records and historical reads while freezing normal activity and lifecycle undo', async () => {
  const registered = await callIdentity(await signInFixture('member'), 'register', { sessionId: 'event-one' });
  const participantId = registered.data.participantId;
  const records: Record<string, object> = {
    [`participants/${participantId}`]: (await fixtureDb.doc(`participants/${participantId}`).get()).data()!,
    'teams/saved': { sessionId: 'event-one', name: 'Winning team', award: 'First place' },
    'discoveryTeams/saved': { sessionId: 'event-one', name: 'Discovery' },
    'formingTeams/saved': { sessionId: 'event-one', leaderId: participantId, memberIds: [participantId], isOpenToMore: true },
    'formingDiscoveryTeams/saved': { sessionId: 'event-one', leaderId: participantId, memberIds: [participantId], isOpenToMore: true },
    'welcomeResponses/saved': { sessionId: 'event-one', uid: 'member', participantId, answer: 'Historical answer' },
    'proposedChallenges/saved': { sessionId: 'event-one', uid: 'member', submitterParticipantId: participantId, title: 'Historical proposal' },
    'proposedChallengeVotes/saved': { sessionId: 'event-one', uid: 'member' },
    'focusAreas/saved': { sessionId: 'event-one', title: 'History' },
    'sessions/event-one/awards/saved': { winner: participantId },
    'sessions/event-one/attendance/saved': { participantId },
    'sessions/event-one/history/saved': { title: 'Preserved' },
  };
  for (const [path, data] of Object.entries(records)) await fixtureDb.doc(path).set(data);
  assert.equal((await remove()).status, 200);
  for (const [path, data] of Object.entries(records)) assert.deepEqual((await fixtureDb.doc(path).get()).data(), data, path);
  for (const uid of ['organizer', 'platform', 'coadmin', 'member']) {
    const database = sdk(uid);
    for (const path of ['sessions/event-one', 'teams/saved', `participants/${participantId}`, 'welcomeResponses/saved']) await assertSucceeds(getDoc(doc(database, path)));
    await assertFails(updateDoc(doc(database, 'sessions/event-one'), { deletedAt: deleteField(), deletedBy: deleteField() }));
    await assertFails(updateDoc(doc(database, 'sessions/event-one'), { status: 'Live' }));
    for (const [path, data] of Object.entries(records).filter(([path]) => !path.startsWith('sessions/'))) {
      await assertFails(updateDoc(doc(database, path), path.startsWith('participants/') ? { name: 'Changed' } : path.startsWith('forming') ? { isOpenToMore: false } : path.startsWith('welcome') ? { answer: 'Changed' } : { name: 'Changed' }));
      await assertFails(deleteDoc(doc(database, path)));
      await assertFails(setDoc(doc(database, path.split('/')[0], 'new-' + uid), data));
    }
    for (const store of ['challenges', 'resources']) await assertFails(setDoc(doc(database, store, 'new-' + uid), { sessionId: 'event-one', title: 'New' }));
    await assertFails(updateDoc(doc(database, 'challenges/event-one-challenge'), { title: 'Changed' }));
    await assertFails(deleteDoc(doc(database, 'challenges/event-one-challenge')));
  }
});

test('concurrent publishing cannot leave deleted event available', async () => {
  const owner = await signInFixture('organizer'), published = await publishFixture();
  const results = await Promise.all([invitationRequest(`${eventPath}/publication/renew`, owner, { revision: published.revision }), remove()]);
  assert.equal(results[1].status, 200); assert.ok([200, 404].includes(results[0].status));
  const current = (await fixtureDb.doc('eventPublications/event-one').get()).data()!;
  assert.equal((await invitationRequest(`/api/invitations/${current.currentToken}`)).status, 404);
  assert.equal((await invitationRequest(`${eventPath}/publication/publish`, owner, { revision: current.revision, fields: publicFields })).status, 404);
});
