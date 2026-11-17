import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { callIdentity, fixtureDb, projectId } from './fixtures';
import { deleteLifecycleEvent, seedLifecycle } from './event-lifecycle-fixtures';

let environment: RulesTestEnvironment;
let fixture: Awaited<ReturnType<typeof seedLifecycle>>;
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => { fixture = await seedLifecycle(); });
after(async () => { await environment?.cleanup(); });

test('soft deletion blocks role-based registration and team operations while retaining participants and hiding active badges', async () => {
  const { tokens, participantId } = fixture;
  const roles = { sessionId: 'event-one', memberUid: 'member', roles: ['participant', 'mentor'] };
  assert.equal((await callIdentity(tokens.organizer, 'event-roles', roles)).status, 200);
  await fixtureDb.doc('teams/retained-team').set({ sessionId: 'event-one', name: 'Retained team', leaderId: participantId });
  await fixtureDb.doc(`participants/${participantId}`).update({ teamId: 'retained-team', isAssigned: true });
  const label = { collectionName: 'teams', teamId: 'retained-team', participantId, label: 'developer' };
  assert.equal((await callIdentity(tokens.member, 'team-role', label)).status, 200);
  await fixtureDb.doc('sessions/event-one').update({ status: 'Team Formation' });
  await fixtureDb.doc('formingTeams/RETAINED').set({ sessionId: 'event-one', leaderId: participantId, memberIds: [participantId], isOpenToMore: true });
  const participant = (await fixtureDb.doc(`participants/${participantId}`).get()).data();
  const pointer = (await fixtureDb.doc('registrations/event-one~member').get()).data();
  assert.equal((await callIdentity(tokens.member, 'my-badges')).data.badges.length, 1);
  await deleteLifecycleEvent(tokens.organizer);
  for (const actor of ['organizer', 'coadmin']) {
    assert.equal((await callIdentity(tokens[actor], 'event-roles', { ...roles, memberUid: 'newcomer' })).status, 404);
    assert.equal((await callIdentity(tokens[actor], 'event-roles', roles)).status, 404);
    assert.equal((await callIdentity(tokens[actor], 'team-role', label)).status, 404);
  }
  assert.equal((await callIdentity(tokens.member, 'team-role', label)).status, 404);
  assert.equal((await callIdentity(tokens.member, 'finalize-team', { kind: 'solution', formingId: 'RETAINED' })).status, 404);
  assert.equal((await fixtureDb.doc('registrations/event-one~newcomer').get()).exists, false);
  assert.deepEqual((await fixtureDb.doc(`participants/${participantId}`).get()).data(), participant);
  assert.deepEqual((await fixtureDb.doc('registrations/event-one~member').get()).data(), pointer);
  assert.ok((await fixtureDb.doc('teams/retained-team').get()).exists);
  assert.ok((await fixtureDb.doc('formingTeams/RETAINED').get()).exists);
  assert.deepEqual((await callIdentity(tokens.member, 'my-badges')).data.badges, []);
});

test('deleted-event SDK guards retain allocation restrictions and deny live writes to both team families', async () => {
  const { tokens, participantId } = fixture;
  const sdk = (uid: string) => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  const member = sdk('member'), organizer = sdk('organizer');
  await assertSucceeds(updateDoc(doc(member, 'participants', participantId), { adjective: 'Before deletion' }));
  assert.equal((await callIdentity(tokens.organizer, 'event-roles', { sessionId: 'event-one', memberUid: 'member', roles: ['mentor'] })).status, 200);
  await assertFails(updateDoc(doc(organizer, 'participants', participantId), { teamId: 'cannot-allocate-staff', isAssigned: true }));
  assert.equal((await callIdentity(tokens.organizer, 'event-roles', { sessionId: 'event-one', memberUid: 'member', roles: ['participant'] })).status, 200);
  for (const collectionName of ['teams', 'discoveryTeams']) {
    await fixtureDb.doc(`${collectionName}/retained`).set({ sessionId: 'event-one', name: 'Retained team' });
  }
  await deleteLifecycleEvent(tokens.organizer);
  await assertFails(updateDoc(doc(member, 'participants', participantId), { adjective: 'After deletion' }));
  for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) {
    await assertFails(setDoc(doc(member, collectionName, 'new-team'), { sessionId: 'event-one', leaderId: participantId, memberIds: [participantId], isOpenToMore: true }));
    await assertFails(setDoc(doc(organizer, collectionName, 'new-staff-team'), { sessionId: 'event-one', name: 'New' }));
    if (!collectionName.startsWith('forming')) {
      await assertFails(updateDoc(doc(organizer, collectionName, 'retained'), { name: 'Changed' }));
      await assertFails(deleteDoc(doc(organizer, collectionName, 'retained')));
    }
  }
});
