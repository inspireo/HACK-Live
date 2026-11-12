import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createProfileCleanup } from '../server/profile-cleanup';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { callIdentity, clearFixtures, createFixtureUser, fixtureAuth, fixtureDb, projectId, seedEvents, signInFixture } from './fixtures';

let environment: RulesTestEnvironment;
const memberContext = (uid: string, verified = true, provider: 'password' | 'anonymous' = 'password') => environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
before(async () => {
  await clearFixtures();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const uid of ['owner', 'other', 'organizer', 'coadmin', 'platform-admin', 'legacy-owner', 'conflicted', 'deleting']) await createFixtureUser(uid);
  await createFixtureUser('unverified', false);
  await fixtureDb.doc('users/platform-admin').set({ role: 'admin' });
  await seedEvents();
});
after(async () => { await environment?.cleanup(); });

test('registered members only: unauthenticated, anonymous and unverified identities denied', async () => {
  for (const database of [environment.unauthenticatedContext().firestore(), memberContext('anonymous', false, 'anonymous'), memberContext('unverified', false)]) {
    for (const path of ['profiles/owner', 'sessions/event-one', 'participants/missing', 'teams/missing']) await assertFails(getDoc(doc(database, path)));
    await assertFails(setDoc(doc(database, 'profiles/new'), { name: 'No', state: 'active' }));
  }
  await assertSucceeds(getDoc(doc(memberContext('other'), 'profiles/owner')));
  await assertSucceeds(getDocs(collection(memberContext('other'), 'sessions')));
  assert.equal((await callIdentity(undefined, 'register', { sessionId: 'event-one' })).status, 401);
  assert.equal((await callIdentity(await signInFixture('unverified'), 'register', { sessionId: 'event-one' })).status, 403);
  const anonymousResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const anonymous = await anonymousResponse.json();
  assert.equal((await callIdentity(anonymous.idToken, 'register', { sessionId: 'event-one' })).status, 403);
});

test('only owner edits minimal profile; profile cannot grant platform role or store contacts', async () => {
  await assertSucceeds(updateDoc(doc(memberContext('owner'), 'profiles/owner'), { name: 'Updated synthetic owner' }));
  await assertFails(updateDoc(doc(memberContext('other'), 'profiles/owner'), { name: 'Stolen' }));
  for (const extra of [{ role: 'admin' }, { email: 'secret@example.test' }, { phone: '1234' }, { state: 'deleting' }]) await assertFails(updateDoc(doc(memberContext('owner'), 'profiles/owner'), extra));
  await assertFails(setDoc(doc(memberContext('owner'), 'users/owner'), { role: 'admin' }));
  await assertFails(getDoc(doc(memberContext('other'), 'registrationDefaults/owner')));
  await assertFails(getDoc(doc(memberContext('other'), 'sessionAccess/event-one')));
  await assertSucceeds(getDoc(doc(memberContext('coadmin'), 'sessionAccess/event-one')));
  await assertSucceeds(updateDoc(doc(memberContext('coadmin'), 'sessions/event-one'), { title: 'Synthetic Design Workshop' }));
  await assertSucceeds(updateDoc(doc(memberContext('platform-admin'), 'sessions/event-one'), { title: 'Synthetic Design Workshop' }));
});

test('trusted registration transaction is idempotent under concurrency and across fresh logins/events', async () => {
  const token = await signInFixture('owner');
  const attempts = await Promise.all(Array.from({ length: 5 }, () => callIdentity(token, 'register', { sessionId: 'event-one', adjective: 'Curious', designThinkingProficiency: 'Trained' })));
  assert.ok(attempts.every(attempt => attempt.status === 200), JSON.stringify(attempts));
  assert.equal(new Set(attempts.map(attempt => attempt.data.participantId)).size, 1);
  const firstId = attempts[0].data.participantId;
  const rejoin = await callIdentity(await signInFixture('owner'), 'register', { sessionId: 'event-one' });
  assert.equal(rejoin.data.participantId, firstId);
  assert.equal((await fixtureDb.collection('participants').where('sessionId', '==', 'event-one').where('memberId', '==', 'owner').get()).size, 1);
  const defaults = await fixtureDb.doc('registrationDefaults/owner').get();
  assert.deepEqual(defaults.data(), { adjective: 'Curious', designThinkingProficiency: 'Trained' });
  const second = await callIdentity(token, 'register', { sessionId: 'event-two', ...defaults.data() });
  assert.equal(second.status, 200);
  assert.notEqual(second.data.participantId, firstId);
  const publicData = (await fixtureDb.doc(`participants/${firstId}`).get()).data()!;
  assert.ok(!('phoneLast4' in publicData) && !('passcode' in publicData));
  await assertFails(setDoc(doc(memberContext('owner'), 'participants/duplicate'), publicData));
  await assertSucceeds(updateDoc(doc(memberContext('owner'), `participants/${firstId}`), { adjective: 'Builder' }));
  await assertFails(updateDoc(doc(memberContext('other'), `participants/${firstId}`), { adjective: 'Hijacked' }));
  await assertFails(updateDoc(doc(memberContext('other'), `participants/${firstId}`), { uid: 'other', passcode: 'updated synthetic owner_1234' }));
  await assertFails(updateDoc(doc(memberContext('owner'), `participants/${firstId}`), { memberId: 'other' }));
  await assertFails(updateDoc(doc(memberContext('organizer'), `participants/${firstId}`), { uid: 'other' }));
  await assertFails(setDoc(doc(memberContext('owner'), 'registrations/event-one~owner'), { participantId: 'duplicate', uid: 'owner', sessionId: 'event-one' }));
  await assertFails(getDoc(doc(memberContext('other'), 'registrations/event-one~owner')));
});

test('legacy public recovery and historical uid never prove profile ownership; only organizer can link', async () => {
  await fixtureDb.doc('participants/legacy').set({ uid: 'legacy-owner', sessionId: 'event-one', name: 'Legacy Person', phoneLast4: '1234', passcode: 'legacy person_1234', adjective: 'Curious', designThinkingProficiency: 'Experienced', teamId: 'legacy-team' });
  await fixtureDb.doc('teams/legacy-team').set({ sessionId: 'event-one', name: 'Preserved team', memberIds: ['legacy'] });
  assert.equal((await callIdentity(await signInFixture('legacy-owner'), 'register', { sessionId: 'event-one' })).status, 409);
  await assertFails(updateDoc(doc(memberContext('legacy-owner'), 'participants/legacy'), { adjective: 'Historical uid alone is insufficient' }));
  await assertFails(updateDoc(doc(memberContext('other'), 'participants/legacy'), { uid: 'other' }));
  assert.equal((await callIdentity(await signInFixture('other'), 'link-legacy', { participantId: 'legacy', memberUid: 'legacy-owner', passcode: 'legacy person_1234' })).status, 403);
  const linked = await callIdentity(await signInFixture('organizer'), 'link-legacy', { participantId: 'legacy', memberUid: 'legacy-owner' });
  assert.equal(linked.status, 200, JSON.stringify(linked));
  const legacy = (await fixtureDb.doc('participants/legacy').get()).data()!;
  assert.equal(legacy.memberId, 'legacy-owner'); assert.equal(legacy.teamId, 'legacy-team');
  assert.ok(!('phoneLast4' in legacy) && !('passcode' in legacy));
  await assertFails(getDoc(doc(memberContext('legacy-owner'), 'legacyParticipantSecrets/legacy')));
  assert.equal((await callIdentity(await signInFixture('legacy-owner'), 'register', { sessionId: 'event-one' })).data.participantId, 'legacy');
  assert.equal((await callIdentity(await signInFixture('organizer'), 'link-legacy', { participantId: 'legacy', memberUid: 'other' })).status, 409);
  await fixtureDb.doc('participants/legacy-conflict').set({ uid: 'old-uid', sessionId: 'event-one', name: 'Conflict' });
  assert.equal((await callIdentity(await signInFixture('organizer'), 'link-legacy', { participantId: 'legacy-conflict', memberUid: 'owner' })).status, 409);
  assert.equal((await fixtureDb.doc('participants/legacy-conflict').get()).data()!.uid, 'old-uid');
});

test('team naming and workshop phase restrictions use registration pointer; member-only display data', async () => {
  const registration = (await fixtureDb.doc('registrations/event-one~owner').get()).data()!;
  const participantId = registration.participantId;
  await fixtureDb.doc('teams/test-team').set({ sessionId: 'event-one', name: 'Before' });
  await fixtureDb.doc(`participants/${participantId}`).update({ teamId: 'test-team' });
  await fixtureDb.doc('sessions/event-one').update({ status: 'Team Naming Open' });
  await assertSucceeds(updateDoc(doc(memberContext('owner'), 'teams/test-team'), { name: 'Synthetic Builders', nameSubmittedBy: 'owner' }));
  await assertFails(updateDoc(doc(memberContext('other'), 'teams/test-team'), { name: 'Hijack', nameSubmittedBy: 'other' }));
  await fixtureDb.doc('sessions/event-one').update({ status: 'Team Naming Locked' });
  await assertFails(updateDoc(doc(memberContext('owner'), 'teams/test-team'), { name: 'Too late' }));
  await assertFails(updateDoc(doc(memberContext('owner'), `participants/${participantId}`), { selectedChallengeId: 'other' }));
  await assertSucceeds(getDoc(doc(memberContext('other'), 'teams/test-team')));
});

test('deletion removes social identity, private defaults, welcome answers, proposal and team attribution; retains Auth/admin/event ownership', async () => {
  const token = await signInFixture('deleting');
  await fixtureDb.doc('users/deleting').set({ role: 'admin' });
  await fixtureDb.doc('sessions/owned-event').set({ ownerId: 'deleting', title: 'Owned workshop' });
  const registered = await callIdentity(token, 'register', { sessionId: 'event-two' });
  const participantId = registered.data.participantId;
  await fixtureDb.doc(`legacyParticipantSecrets/${participantId}`).set({ uid: 'deleting', phoneLast4: '6789' });
  await fixtureDb.doc('welcomeResponses/answer').set({ sessionId: 'event-two', participantId, response: 'Personal answer' });
  await fixtureDb.doc('proposedChallengeVotes/vote').set({ uid: 'deleting', sessionId: 'event-two' });
  await fixtureDb.doc('proposedChallenges/proposal').set({ uid: 'deleting', sessionId: 'event-two', title: 'Keep workshop content', submitterName: 'Person', submitterRealName: 'Real Person', submitterProfileDescriptor: 'Curious', submitterParticipantId: participantId });
  for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) await fixtureDb.doc(`${collectionName}/delete-team`).set({ sessionId: 'event-two', memberIds: [participantId, 'retained'], leaderId: participantId, nameSubmittedBy: 'deleting', name: 'Shared workshop team' });
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  assert.deepEqual((await fixtureDb.doc('profiles/deleting').get()).data(), { state: 'deleted' });
  assert.equal((await fixtureAuth.getUser('deleting')).emailVerified, true);
  assert.equal((await fixtureDb.doc('users/deleting').get()).data()!.role, 'admin');
  assert.equal((await fixtureDb.doc('sessions/owned-event').get()).data()!.ownerId, 'deleting');
  assert.equal((await fixtureDb.doc('registrationDefaults/deleting').get()).exists, false);
  assert.equal((await fixtureDb.doc('registrations/event-two~deleting').get()).exists, false);
  assert.equal((await fixtureDb.doc(`legacyParticipantSecrets/${participantId}`).get()).exists, false);
  assert.equal((await fixtureDb.doc('welcomeResponses/answer').get()).exists, false);
  assert.equal((await fixtureDb.doc('proposedChallengeVotes/vote').get()).exists, false);
  const proposal = (await fixtureDb.doc('proposedChallenges/proposal').get()).data()!;
  assert.equal(proposal.uid, null); assert.equal(proposal.submitterName, 'Deleted member');
  for (const field of ['submitterRealName', 'submitterProfileDescriptor', 'submitterParticipantId']) assert.ok(!(field in proposal));
  const participant = (await fixtureDb.doc(`participants/${participantId}`).get()).data()!;
  assert.equal(participant.name, 'Deleted member'); assert.equal(participant.uid, null); assert.equal(participant.memberId, null);
  for (const collectionName of ['teams', 'discoveryTeams', 'formingTeams', 'formingDiscoveryTeams']) {
    const team = (await fixtureDb.doc(`${collectionName}/delete-team`).get()).data()!;
    assert.deepEqual(team.memberIds, ['retained']); assert.ok(!('leaderId' in team) && !('nameSubmittedBy' in team));
  }
  await assertFails(getDoc(doc(memberContext('other'), 'profiles/deleting')));
  assert.equal((await callIdentity(token, 'register', { sessionId: 'event-two' })).status, 409);
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200); // retry is idempotent
  await assertSucceeds(setDoc(doc(memberContext('deleting'), 'profiles/deleting'), { name: 'New social profile', state: 'active' }));
  assert.equal((await callIdentity(token, 'register', { sessionId: 'event-two' })).status, 200);
});


test('forming-team consent and trusted finalization preserve multi-member flows without arbitrary participant edits', async () => {
  await callIdentity(await signInFixture('other'), 'register', { sessionId: 'event-two' });
  const ownId = (await fixtureDb.doc('registrations/event-two~owner').get()).data()!.participantId;
  const otherId = (await fixtureDb.doc('registrations/event-two~other').get()).data()!.participantId;
  for (const participantId of [ownId, otherId]) await fixtureDb.doc(`participants/${participantId}`).update({ selectedChallengeId: 'event-two-challenge' });
  await fixtureDb.doc('sessions/event-two').update({ status: 'Team Formation' });
  const forming = { sessionId: 'event-two', leaderId: ownId, challengeId: 'event-two-challenge', memberIds: [ownId], isOpenToMore: true };
  await assertSucceeds(setDoc(doc(memberContext('owner'), 'formingTeams/CONSENT'), forming));
  await assertFails(updateDoc(doc(memberContext('owner'), 'formingTeams/CONSENT'), { memberIds: [ownId, otherId] }));
  await assertFails(updateDoc(doc(memberContext('other'), 'formingTeams/CONSENT'), { leaderId: otherId }));
  await assertSucceeds(updateDoc(doc(memberContext('other'), 'formingTeams/CONSENT'), { memberIds: [ownId, otherId] }));
  assert.equal((await callIdentity(await signInFixture('other'), 'finalize-team', { kind: 'solution', formingId: 'CONSENT' })).status, 403);
  const finalized = await callIdentity(await signInFixture('owner'), 'finalize-team', { kind: 'solution', formingId: 'CONSENT' });
  assert.equal(finalized.status, 200, JSON.stringify(finalized));
  for (const participantId of [ownId, otherId]) assert.equal((await fixtureDb.doc(`participants/${participantId}`).get()).data()!.teamId, finalized.data.teamId);
  assert.equal((await fixtureDb.doc('formingTeams/CONSENT').get()).exists, false);
  assert.equal((await callIdentity(await signInFixture('owner'), 'finalize-team', { kind: 'solution', formingId: 'CONSENT' })).status, 409);
});

test('repeatable migration strips participant contacts/passcodes and makes session emails private, never backfills ownership', async () => {
  await fixtureDb.doc('participants/migration-only').set({ uid: 'old-editable-uid', sessionId: 'legacy-event', name: 'Legacy', phoneLast4: '1234', passcode: 'legacy_1234', email: 'private@example.test' });
  await fixtureDb.doc('sessions/legacy-event').set({ ownerId: 'organizer', ownerEmail: 'organizer@example.test', adminEmails: ['coadmin@example.test'] });
  const runMigration = (apply: boolean) => JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate-identity.ts', ...(apply ? ['--apply'] : [])], { env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8' }).trim());
  assert.equal(runMigration(false).mode, 'dry-run');
  assert.equal((await fixtureDb.doc('participants/migration-only').get()).data()!.phoneLast4, '1234');
  assert.equal(runMigration(true).mode, 'applied');
  const participant = (await fixtureDb.doc('participants/migration-only').get()).data()!;
  assert.ok(!('phoneLast4' in participant) && !('passcode' in participant) && !('email' in participant) && !('memberId' in participant));
  assert.equal(participant.uid, 'old-editable-uid');
  const secret = (await fixtureDb.doc('legacyParticipantSecrets/migration-only').get()).data()!;
  assert.equal(secret.email, 'private@example.test'); assert.ok(!('passcode' in secret));
  const session = (await fixtureDb.doc('sessions/legacy-event').get()).data()!;
  assert.ok(!('ownerEmail' in session) && !('adminEmails' in session));
  await assertFails(getDoc(doc(memberContext('other'), 'sessionAccess/legacy-event')));
  await assertSucceeds(getDoc(doc(memberContext('coadmin'), 'sessionAccess/legacy-event')));
  assert.equal(runMigration(true).participantCount, 0);
  assert.equal(runMigration(true).sessionCount, 0);
});


test('actual BulkWriter failure retains deleting state; authenticated retry finishes cleanup', async () => {
  await createFixtureUser('retry-deletion');
  const token = await signInFixture('retry-deletion');
  const registered = await callIdentity(token, 'register', { sessionId: 'event-two' });
  assert.equal(registered.status, 200);
  await fixtureDb.doc('profiles/retry-deletion').set({ state: 'deleting', name: 'Pending deletion' });
  const cleanup = createProfileCleanup(fixtureDb, 'retry-deletion');
  // Real SDK + emulator NOT_FOUND write failure, no mocked authorization or SDK.
  cleanup.update(fixtureDb.doc('participants/nonexistent-cleanup-target'), { name: 'Deleted member' });
  cleanup.delete(fixtureDb.doc('registrationDefaults/retry-deletion'));
  await assert.rejects(cleanup.finish());
  assert.equal((await fixtureDb.doc('profiles/retry-deletion').get()).data()!.state, 'deleting');
  await assertFails(setDoc(doc(memberContext('retry-deletion'), 'profiles/retry-deletion'), { state: 'active', name: 'Cannot revive during cleanup' }));
  assert.equal((await callIdentity(token, 'register', { sessionId: 'event-two' })).status, 409);
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  assert.deepEqual((await fixtureDb.doc('profiles/retry-deletion').get()).data(), { state: 'deleted' });
  assert.equal((await fixtureDb.doc(`participants/${registered.data.participantId}`).get()).data()!.memberId, null);
});

test('organizer registration removal cleans unique pointer and permits deliberate rejoin', async () => {
  await createFixtureUser('removed-member');
  const token = await signInFixture('removed-member');
  const first = await callIdentity(token, 'register', { sessionId: 'event-two' });
  const payload = { sessionId: 'event-two', participantId: first.data.participantId };
  assert.equal((await callIdentity(await signInFixture('other'), 'remove-registration', payload)).status, 403);
  assert.equal((await callIdentity(await signInFixture('organizer'), 'remove-registration', payload)).status, 200);
  assert.equal((await fixtureDb.doc('registrations/event-two~removed-member').get()).exists, false);
  const rejoin = await callIdentity(token, 'register', { sessionId: 'event-two' });
  assert.equal(rejoin.status, 200);
  assert.notEqual(rejoin.data.participantId, first.data.participantId);
});
