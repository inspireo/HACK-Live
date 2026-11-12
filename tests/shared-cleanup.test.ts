import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from '../server/profile-cleanup';
import { queueSharedContentCleanup } from '../server/shared-content-cleanup';
import { callIdentity, clearFixtures, createFixtureUser, fixtureDb, projectId, seedEvents, signInFixture } from './fixtures';

let environment: RulesTestEnvironment;
const client = (uid: string) => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
before(async () => {
  await clearFixtures(); await seedEvents(); await createFixtureUser('organizer');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => { await environment?.cleanup(); });
async function members(prefix: string) {
  const result: Record<string, { uid: string; participantId: string; token: string }> = {};
  for (const role of ['a', 'b', 'leader', 'c']) {
    const uid = `${prefix}-${role}`; await createFixtureUser(uid); const token = await signInFixture(uid);
    const registered = await callIdentity(token, 'register', { sessionId: 'event-one' });
    assert.equal(registered.status, 200);
    result[role] = { uid, token, participantId: registered.data.participantId };
  }
  return result;
}

test('paused shared cleanup preserves authorized C join and B leave in both forming-team kinds', async () => {
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) {
    const group = await members(`joins-${collectionName}`);
    const { a, b, leader, c } = group;
    const reference = fixtureDb.doc(`${collectionName}/JOIN-${collectionName}`);
    await reference.set({ sessionId: 'event-one', leaderId: leader.participantId, memberIds: [leader.participantId, a.participantId, b.participantId], isOpenToMore: true });
    const manifest = await beginProfileDeletion(fixtureDb, a.uid);
    const cleanup = createProfileCleanup(fixtureDb, a.uid, manifest.attemptId);
    await queueSharedContentCleanup(fixtureDb, a.uid, manifest.attemptId, manifest, cleanup);
    // Real authorized peer writes occur after queue construction, before commit.
    await assertSucceeds(updateDoc(doc(client(c.uid), reference.path), { memberIds: [leader.participantId, a.participantId, b.participantId, c.participantId] }));
    await assertSucceeds(updateDoc(doc(client(b.uid), reference.path), { memberIds: [leader.participantId, a.participantId, c.participantId] }));
    await cleanup.finish();
    assert.deepEqual((await reference.get()).data()?.memberIds, [leader.participantId, c.participantId]);
    assert.equal((await reference.get()).data()?.leaderId, leader.participantId);
  }
});

test('paused cleanup preserves new authorized team names and attribution while clearing only current deleted references', async () => {
  const { a, b, leader } = await members('team-name');
  await fixtureDb.doc('sessions/event-one').update({ status: 'Team Naming Open' });
  for (const collectionName of ['teams', 'discoveryTeams']) await fixtureDb.doc(`${collectionName}/fresh-name`).set({ sessionId: 'event-one', name: 'Old shared name', memberIds: [leader.participantId, a.participantId, b.participantId], leaderId: a.participantId, createdBy: a.uid, nameSubmittedBy: a.uid });
  await fixtureDb.doc(`participants/${b.participantId}`).update({ teamId: 'fresh-name', solutioning_team_id: 'fresh-name' });
  const manifest = await beginProfileDeletion(fixtureDb, a.uid);
  const cleanup = createProfileCleanup(fixtureDb, a.uid, manifest.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, manifest.attemptId, manifest, cleanup);
  await assertSucceeds(updateDoc(doc(client(b.uid), 'teams/fresh-name'), { name: 'Fresh peer name', nameSubmittedBy: b.uid }));
  for (const collectionName of ['teams', 'discoveryTeams']) await assertSucceeds(updateDoc(doc(client('organizer'), `${collectionName}/fresh-name`), { name: 'Fresh peer name', nameSubmittedBy: b.uid, createdBy: b.uid }));
  await cleanup.finish();
  for (const collectionName of ['teams', 'discoveryTeams']) {
    const current = (await fixtureDb.doc(`${collectionName}/fresh-name`).get()).data()!;
    assert.equal(current.name, 'Fresh peer name'); assert.equal(current.nameSubmittedBy, b.uid); assert.equal(current.createdBy, b.uid);
    assert.equal(current.leaderId, undefined); assert.deepEqual(current.memberIds, [leader.participantId, b.participantId]);
  }
});

test('durable original challenge attribution plan preserves fresh prose/new attribution across queued retry', async () => {
  const { a, b } = await members('challenge-prose');
  await fixtureDb.doc('proposedChallenges/shared-prose').set({ uid: a.uid, sessionId: 'event-one', submitterParticipantId: a.participantId, submitterName: 'Original author' });
  const originalSlot = '<p><em>Proposed by: Original author</em></p>';
  const freshSlot = '<p><em>Proposed by: New surviving author</em></p>';
  for (const suffix of ['same-author', 'new-author']) await fixtureDb.doc(`challenges/prose-${suffix}`).set({ sessionId: 'event-one', proposedChallengeId: 'shared-prose', summary: `<p>Old prose</p>${originalSlot}`, submitterName: 'Original author' });
  await fixtureDb.doc('challenges/prose-already-new-author').set({ sessionId: 'event-one', proposedChallengeId: 'shared-prose', summary: `<p>Already fresh prose</p>${freshSlot}`, submitterName: 'New surviving author' });
  const first = await beginProfileDeletion(fixtureDb, a.uid);
  const paused = createProfileCleanup(fixtureDb, a.uid, first.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, first.attemptId, first, paused);
  await assertSucceeds(updateDoc(doc(client('organizer'), 'challenges/prose-same-author'), { summary: `<p>Fresh peer prose retained</p>${originalSlot}` }));
  await assertSucceeds(updateDoc(doc(client('organizer'), 'challenges/prose-new-author'), { summary: `<p>Fresh peer prose and attribution</p>${freshSlot}`, submitterName: 'New surviving author' }));
  await assertSucceeds(updateDoc(doc(client('organizer'), 'proposedChallenges/shared-prose'), { uid: b.uid, submitterParticipantId: b.participantId, submitterName: 'New surviving author' }));
  // Retry cannot recapture B's new name as A's original attribution to erase.
  await paused.abort(); await releaseProfileDeletion(fixtureDb, a.uid, first.attemptId);
  const next = await beginProfileDeletion(fixtureDb, a.uid);
  const cleanup = createProfileCleanup(fixtureDb, a.uid, next.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, next.attemptId, next, cleanup);
  await cleanup.finish();
  const same = (await fixtureDb.doc('challenges/prose-same-author').get()).data()!;
  assert.equal(same.summary, '<p>Fresh peer prose retained</p><p><em>Proposed by: Deleted member</em></p>');
  assert.equal(same.submitterName, 'Deleted member');
  const fresh = (await fixtureDb.doc('challenges/prose-new-author').get()).data()!;
  assert.equal(fresh.summary, `<p>Fresh peer prose and attribution</p>${freshSlot}`); assert.equal(fresh.submitterName, 'New surviving author');
  const alreadyFresh = (await fixtureDb.doc('challenges/prose-already-new-author').get()).data()!;
  assert.equal(alreadyFresh.summary, `<p>Already fresh prose</p>${freshSlot}`); assert.equal(alreadyFresh.submitterName, 'New surviving author');
  assert.equal((await fixtureDb.doc('proposedChallenges/shared-prose').get()).data()?.uid, b.uid);
  assert.equal((await fixtureDb.doc('proposedChallenges/shared-prose').get()).data()?.submitterName, 'New surviving author');
});

test('concurrent A/B deletion never restores either identity or loses an authorized fresh member', async () => {
  const { a, b, leader, c } = await members('two-deletions');
  const reference = fixtureDb.doc('formingTeams/DUAL');
  await reference.set({ sessionId: 'event-one', leaderId: leader.participantId, memberIds: [leader.participantId, a.participantId, b.participantId], isOpenToMore: true });
  const first = await beginProfileDeletion(fixtureDb, a.uid); const second = await beginProfileDeletion(fixtureDb, b.uid);
  const cleanupA = createProfileCleanup(fixtureDb, a.uid, first.attemptId); const cleanupB = createProfileCleanup(fixtureDb, b.uid, second.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, first.attemptId, first, cleanupA);
  await queueSharedContentCleanup(fixtureDb, b.uid, second.attemptId, second, cleanupB);
  await assertSucceeds(updateDoc(doc(client(c.uid), reference.path), { memberIds: [leader.participantId, a.participantId, b.participantId, c.participantId] }));
  await Promise.all([cleanupA.finish(), cleanupB.finish()]);
  assert.deepEqual((await reference.get()).data()?.memberIds, [leader.participantId, c.participantId]);
});

test('shared targets deleted after queue construction remain idempotent and are never recreated', async () => {
  const { a, leader } = await members('missing-shared');
  await fixtureDb.doc('proposedChallenges/missing-shared').set({ uid: a.uid, sessionId: 'event-one', submitterParticipantId: a.participantId });
  await fixtureDb.doc('challenges/missing-shared').set({ sessionId: 'event-one', proposedChallengeId: 'missing-shared', summary: '<p>Retained if present</p>' });
  await fixtureDb.doc('teams/missing-shared').set({ sessionId: 'event-one', memberIds: [leader.participantId, a.participantId] });
  const manifest = await beginProfileDeletion(fixtureDb, a.uid); const cleanup = createProfileCleanup(fixtureDb, a.uid, manifest.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, manifest.attemptId, manifest, cleanup);
  for (const collectionName of ['proposedChallenges', 'challenges', 'teams']) await assertSucceeds(deleteDoc(doc(client('organizer'), `${collectionName}/missing-shared`)));
  await cleanup.finish();
  for (const collectionName of ['proposedChallenges', 'challenges', 'teams']) assert.equal((await fixtureDb.doc(`${collectionName}/missing-shared`).get()).exists, false);
});

test('stale conditional shared-content worker cannot touch peer edits after actual deletion takeover/recreation', async () => {
  const { a, b, leader } = await members('stale-shared');
  const reference = fixtureDb.doc('teams/stale-shared');
  await reference.set({ sessionId: 'event-one', memberIds: [leader.participantId, a.participantId, b.participantId], name: 'Original', nameSubmittedBy: a.uid });
  const first = await beginProfileDeletion(fixtureDb, a.uid); const paused = createProfileCleanup(fixtureDb, a.uid, first.attemptId);
  await queueSharedContentCleanup(fixtureDb, a.uid, first.attemptId, first, paused);
  await releaseProfileDeletion(fixtureDb, a.uid, first.attemptId);
  assert.equal((await callIdentity(a.token, 'delete-profile')).status, 200);
  await assertSucceeds(setDoc(doc(client(a.uid), `profiles/${a.uid}`), { name: 'Recreated member', state: 'active' }));
  await assertSucceeds(updateDoc(doc(client('organizer'), reference.path), { name: 'Fresh current name', nameSubmittedBy: b.uid }));
  const before = (await reference.get()).data();
  await assert.rejects(paused.finish(), /superseded/);
  assert.deepEqual((await reference.get()).data(), before);
});
