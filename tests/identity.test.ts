import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion } from '../server/profile-cleanup';
import { emptyDetails } from '../shared/profile';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { identityDatabaseTarget } from '../server/database-config';
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

test('profile source is owner-only, generated projection exposes only selected professional fields', async () => {
  await createFixtureUser('profile-owner');
  const token = await signInFixture('profile-owner');
  const registered = await callIdentity(token, 'register', { sessionId: 'event-one', adjective: 'Curious', designThinkingProficiency: 'Trained' });
  assert.equal(registered.status, 200);
  const priorParticipant = (await fixtureDb.doc(`participants/${registered.data.participantId}`).get()).data();
  const payload = { name: 'Reusable member', ...emptyDetails(), professional: { title: 'Engineer', bio: 'Private biography', avatarUrl: 'https://example.test/avatar.png', github: 'https://github.com/synthetic' }, contacts: { contactEmail: 'separate@example.test', phone: '+65 1234 5678', signal: 'private-handle' }, communityFields: ['title', 'github'], connectionFields: ['contactEmail'] };
  if (payload.professional?.avatarUrl) await fixtureDb.doc(`profileDetails/${(await fixtureAuth.verifyIdToken(token)).uid}`).set({ ...emptyDetails(), professional: { avatarUrl: payload.professional.avatarUrl } });
  assert.equal((await callIdentity(token, 'save-profile', payload)).status, 200);
  assert.deepEqual((await fixtureDb.doc('profiles/profile-owner').get()).data(), { name: payload.name, state: 'active' });
  assert.equal((await fixtureAuth.getUser('profile-owner')).email, 'profile-owner@example.test');
  assert.deepEqual((await fixtureDb.doc(`participants/${registered.data.participantId}`).get()).data(), priorParticipant);
  assert.equal((await callIdentity(token, 'register', { sessionId: 'event-one' })).data.participantId, registered.data.participantId);
  const projection = { title: 'Engineer', github: 'https://github.com/synthetic' };
  assert.deepEqual((await fixtureDb.doc('memberDetails/profile-owner').get()).data(), projection);
  assert.deepEqual((await getDoc(doc(memberContext('other'), 'memberDetails/profile-owner'))).data(), projection);
  assert.equal((await getDoc(doc(memberContext('profile-owner'), 'profileDetails/profile-owner'))).data()!.contacts.contactEmail, 'separate@example.test');
  for (const database of [memberContext('other'), environment.unauthenticatedContext().firestore(), memberContext('unverified', false), memberContext('anonymous', false, 'anonymous')]) {
    await assertFails(getDoc(doc(database, 'profileDetails/profile-owner')));
    await assertFails(getDoc(doc(database, 'connectionContacts/profile-owner')));
  }
  for (const database of [environment.unauthenticatedContext().firestore(), memberContext('unverified', false), memberContext('anonymous', false, 'anonymous')]) await assertFails(getDoc(doc(database, 'memberDetails/profile-owner')));
  for (const database of [memberContext('profile-owner'), memberContext('other'), memberContext('platform-admin')]) {
    for (const path of ['profileDetails/profile-owner', 'memberDetails/profile-owner', 'connectionContacts/profile-owner']) await assertFails(setDoc(doc(database, path), { phone: 'leak' }));
  }
  await assertFails(getDocs(collection(memberContext('profile-owner'), 'profileDetails')));
  await assertFails(getDoc(doc(memberContext('profile-owner'), 'connectionContacts/profile-owner')));
  assert.equal((await fixtureDb.doc('connectionContacts/profile-owner').get()).exists, false);
  // Full replacement removes previously shared fields and keeps ONE global selection.
  assert.equal((await callIdentity(token, 'save-profile', { ...payload, communityFields: [], connectionFields: ['phone', 'signal'] })).status, 200);
  assert.deepEqual((await fixtureDb.doc('memberDetails/profile-owner').get()).data(), {});
  assert.deepEqual((await fixtureDb.doc('profileDetails/profile-owner').get()).data()!.connectionFields, ['phone', 'signal']);
});

test('server rejects malicious fields/links without partial writes; token owns edits and authority is unchanged', async () => {
  const token = await signInFixture('profile-owner');
  const payload = { name: 'Safe name', ...emptyDetails() };
  const beforeSource = (await fixtureDb.doc('profileDetails/profile-owner').get()).data();
  await fixtureDb.doc('users/profile-owner').set({ role: 'admin' });
  await fixtureDb.doc('registrationDefaults/profile-owner').set({ adjective: 'Curious', designThinkingProficiency: 'Trained' });
  const originalOther = (await fixtureDb.doc('profiles/other').get()).data();
  for (const mutation of [{ uid: 'other' }, { role: 'admin' }, { state: 'deleted' }, { eventRoles: ['organizer'] }, { awards: ['winner'] }, { professional: { phone: 'leak' } }, { contacts: { password: 'secret' } }, { communityFields: ['contactEmail'] }, { connectionFields: { other: ['phone'] } }, { professional: { avatarUrl: 'javascript:alert(1)' } }, { professional: { portfolio: 'http://example.test' } }, { professional: { linkedin: 'https://evil.test' } }, { contacts: { contactEmail: 'invalid' } }]) assert.equal((await callIdentity(token, 'save-profile', { ...payload, ...mutation })).status, 400);
  assert.deepEqual((await fixtureDb.doc('profileDetails/profile-owner').get()).data(), beforeSource);
  assert.deepEqual((await fixtureDb.doc('profiles/other').get()).data(), originalOther);
  assert.equal((await callIdentity(undefined, 'save-profile', payload)).status, 401);
  assert.equal((await callIdentity(await signInFixture('unverified'), 'save-profile', payload)).status, 403);
  assert.equal((await callIdentity(token, 'save-profile', { ...payload, professional: { avatarUrl: beforeSource!.professional.avatarUrl }, photoUpload: null })).status, 200);
  assert.deepEqual((await fixtureDb.doc('users/profile-owner').get()).data(), { role: 'admin' });
  assert.deepEqual((await fixtureDb.doc('registrationDefaults/profile-owner').get()).data(), { adjective: 'Curious', designThinkingProficiency: 'Trained' });
});

test('name-only compatibility and delete/retry clear private source and photo projection without Auth/role loss', async () => {
  await createFixtureUser('profile-delete');
  const token = await signInFixture('profile-delete');
  assert.equal((await getDoc(doc(memberContext('other'), 'memberDetails/profile-delete'))).exists(), false);
  const payload = { name: 'Existing name only', ...emptyDetails(), professional: { avatarUrl: 'https://example.test/photo.png', title: 'Designer' }, communityFields: ['avatarUrl'], contacts: { phone: '+65 1234 5678' }, connectionFields: ['phone'] };
  await fixtureDb.doc('profileDetails/profile-delete').set({ ...emptyDetails(), professional: { avatarUrl: payload.professional.avatarUrl } });
  assert.equal((await callIdentity(token, 'save-profile', payload)).status, 200);
  assert.deepEqual((await fixtureDb.doc('memberDetails/profile-delete').get()).data(), { avatarUrl: 'https://example.test/photo.png' });
  await fixtureDb.doc('users/profile-delete').set({ role: 'admin' });
  const manifest = await beginProfileDeletion(fixtureDb, 'profile-delete');
  const paused = createProfileCleanup(fixtureDb, 'profile-delete', manifest.attemptId);
  await assertFails(getDoc(doc(memberContext('other'), 'memberDetails/profile-delete')));
  assert.equal((await callIdentity(token, 'save-profile', payload)).status, 409);
  // A crashed request's lease expires; the next attempt owns all queued mutations.
  await fixtureDb.doc('profileDeletionJobs/profile-delete').update({ leaseUntil: 0 });
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  for (const collectionName of ['profileDetails', 'memberDetails']) assert.equal((await fixtureDb.doc(`${collectionName}/profile-delete`).get()).exists, false);
  assert.equal((await fixtureAuth.getUser('profile-delete')).emailVerified, true);
  assert.equal((await fixtureDb.doc('users/profile-delete').get()).data()!.role, 'admin');
  assert.equal((await callIdentity(token, 'save-profile', payload)).status, 409);
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  await assertSucceeds(setDoc(doc(memberContext('profile-delete'), 'profiles/profile-delete'), { name: 'Recreated name', state: 'active' }));
  assert.equal((await getDoc(doc(memberContext('profile-delete'), 'profileDetails/profile-delete'))).exists(), false);
  assert.equal((await callIdentity(token, 'save-profile', { ...payload, name: 'Fresh details', professional: { title: 'Fresh title' }, communityFields: ['title'] })).status, 200);
  await assert.rejects(paused.finish(), /superseded/);
  assert.equal((await fixtureDb.doc('profileDetails/profile-delete').get()).data()!.professional.title, 'Fresh title');
  assert.deepEqual((await fixtureDb.doc('memberDetails/profile-delete').get()).data(), { title: 'Fresh title' });
});

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
    const snapshot = await fixtureDb.doc(`${collectionName}/delete-team`).get();
    if (collectionName.startsWith('forming')) { assert.equal(snapshot.exists, false); continue; }
    const team = snapshot.data()!;
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


test('actual Firestore cleanup write failure retains deleting state; authenticated retry finishes cleanup', async () => {
  await createFixtureUser('retry-deletion');
  const token = await signInFixture('retry-deletion');
  const registered = await callIdentity(token, 'register', { sessionId: 'event-two' });
  assert.equal(registered.status, 200);
  const manifest = await beginProfileDeletion(fixtureDb, 'retry-deletion');
  const cleanup = createProfileCleanup(fixtureDb, 'retry-deletion', manifest.attemptId);
  // Real SDK transaction + emulator NOT_FOUND failure, no mocked authorization or SDK.
  cleanup.update(fixtureDb.doc('participants/nonexistent-cleanup-target'), { name: 'Deleted member' });
  cleanup.delete(fixtureDb.doc('registrationDefaults/retry-deletion'));
  await assert.rejects(cleanup.finish());
  assert.equal((await fixtureDb.doc('profiles/retry-deletion').get()).data()!.state, 'deleting');
  await assertFails(setDoc(doc(memberContext('retry-deletion'), 'profiles/retry-deletion'), { state: 'active', name: 'Cannot revive during cleanup' }));
  assert.equal((await callIdentity(token, 'register', { sessionId: 'event-two' })).status, 409);
  await releaseProfileDeletion(fixtureDb, 'retry-deletion', manifest.attemptId);
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


test('interrupted deletion resumes persisted participant/proposal IDs after ownership and pointer erasure', async () => {
  await createFixtureUser('interrupted-member');
  const token = await signInFixture('interrupted-member');
  const registered = await callIdentity(token, 'register', { sessionId: 'event-two' });
  const participantId = registered.data.participantId;
  await fixtureDb.doc('proposedChallenges/interrupted-proposal').set({ uid: 'interrupted-member', sessionId: 'event-two', submitterParticipantId: participantId, submitterName: 'Interrupted Person', publishedChallengeId: 'legacy-published' });
  await fixtureDb.doc('challenges/legacy-published').set({ sessionId: 'event-two', proposedChallengeId: 'interrupted-proposal', summary: '<p>Keep this workshop content</p><p><em>Proposed by: Interrupted Person</em></p>' });
  await fixtureDb.doc('welcomeResponses/interrupted-answer').set({ participantId, response: 'Remove private answer', sessionId: 'event-two' });
  await fixtureDb.doc('teams/interrupted-team').set({ sessionId: 'event-two', memberIds: [participantId, 'retained'], nameSubmittedBy: 'interrupted-member', name: 'Keep shared team' });
  const manifest = await beginProfileDeletion(fixtureDb, 'interrupted-member');
  assert.deepEqual(manifest.participantIds, [participantId]);
  await assertFails(getDoc(doc(memberContext('interrupted-member'), 'profileDeletionJobs/interrupted-member')));
  // Deterministic crash boundary: commit the first cleanup writes, leave later
  // dependent records in place, and model the expired process lease in fixtures.
  await fixtureDb.doc(`participants/${participantId}`).update({ uid: null, memberId: null, name: 'Deleted member' });
  await fixtureDb.doc('registrations/event-two~interrupted-member').delete();
  await fixtureDb.doc('proposedChallenges/interrupted-proposal').update({ uid: null, submitterParticipantId: null });
  assert.equal((await callIdentity(token, 'delete-profile')).status, 409); // concurrent request is serialized
  await fixtureDb.doc('profileDeletionJobs/interrupted-member').update({ leaseUntil: 0 });
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  assert.equal((await fixtureDb.doc('welcomeResponses/interrupted-answer').get()).exists, false);
  assert.deepEqual((await fixtureDb.doc('teams/interrupted-team').get()).data()!.memberIds, ['retained']);
  const published = (await fixtureDb.doc('challenges/legacy-published').get()).data()!;
  assert.ok(!published.summary.includes('Interrupted Person'));
  assert.ok(published.summary.includes('Keep this workshop content'));
  assert.equal((await fixtureDb.doc('profileDeletionJobs/interrupted-member').get()).exists, false);
  assert.deepEqual((await fixtureDb.doc('profiles/interrupted-member').get()).data(), { state: 'deleted' });
});

test('deleting a forming leader cancels both team kinds so another member can form again', async () => {
  for (const uid of ['forming-leader', 'forming-survivor']) { await createFixtureUser(uid); await callIdentity(await signInFixture(uid), 'register', { sessionId: 'event-two' }); }
  const leaderId = (await fixtureDb.doc('registrations/event-two~forming-leader').get()).data()!.participantId;
  const survivorId = (await fixtureDb.doc('registrations/event-two~forming-survivor').get()).data()!.participantId;
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) await fixtureDb.doc(`${collectionName}/CANCELLED`).set({ sessionId: 'event-two', leaderId, memberIds: [leaderId, survivorId], isOpenToMore: true });
  assert.equal((await callIdentity(await signInFixture('forming-leader'), 'delete-profile')).status, 200);
  for (const collectionName of ['formingTeams', 'formingDiscoveryTeams']) {
    assert.equal((await fixtureDb.doc(`${collectionName}/CANCELLED`).get()).exists, false);
    await assertSucceeds(setDoc(doc(memberContext('forming-survivor'), `${collectionName}/RECOVERED`), { sessionId: 'event-two', leaderId: survivorId, memberIds: [survivorId], isOpenToMore: true }));
  }
});

test('competing solution and discovery finalizations never overwrite an established assignment, sequentially or concurrently', async () => {
  for (const kind of ['solution', 'discovery']) for (const concurrent of [false, true]) {
    const suffix = `${kind}-${concurrent}`;
    const uids = [`lead-a-${suffix}`, `lead-b-${suffix}`, `shared-${suffix}`];
    const participantIds: string[] = [];
    for (const uid of uids) { await createFixtureUser(uid); const registered = await callIdentity(await signInFixture(uid), 'register', { sessionId: 'event-two' }); participantIds.push(registered.data.participantId); }
    for (const participantId of participantIds) await fixtureDb.doc(`participants/${participantId}`).update({ selectedChallengeId: 'event-two-challenge' });
    await fixtureDb.doc('sessions/event-two').update({ status: kind === 'solution' ? 'Team Formation' : 'Discovery Team Formation' });
    const collectionName = kind === 'solution' ? 'formingTeams' : 'formingDiscoveryTeams';
    const codes = [`A_${suffix.toUpperCase()}`, `B_${suffix.toUpperCase()}`];
    for (let position = 0; position < 2; position++) {
      await assertSucceeds(setDoc(doc(memberContext(uids[position]), `${collectionName}/${codes[position]}`), { sessionId: 'event-two', leaderId: participantIds[position], memberIds: [participantIds[position]], challengeId: 'event-two-challenge', isOpenToMore: true }));
      await assertSucceeds(updateDoc(doc(memberContext(uids[2]), `${collectionName}/${codes[position]}`), { memberIds: [participantIds[position], participantIds[2]] }));
    }
    const finalize = async (position: number) => callIdentity(await signInFixture(uids[position]), 'finalize-team', { kind, formingId: codes[position] });
    const outcomes = concurrent ? await Promise.all([finalize(0), finalize(1)]) : [await finalize(0), await finalize(1)];
    assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), [200, 409], JSON.stringify(outcomes));
    const winner = outcomes.find(outcome => outcome.status === 200)!;
    const shared = (await fixtureDb.doc(`participants/${participantIds[2]}`).get()).data()!;
    assert.equal(kind === 'solution' ? shared.teamId : shared.discoveryTeamId, winner.data.teamId);
  }
});

test('server, migration and deployment agree on the named database; emulator config stays synthetic default', async () => {
  const config = JSON.parse(await readFile('firebase-applet-config.json', 'utf8'));
  const production = identityDatabaseTarget({});
  assert.equal(production.databaseId, config.firestoreDatabaseId);
  assert.equal(production.projectId, config.projectId);
  assert.equal(identityDatabaseTarget({ IDENTITY_EMULATORS: 'true', GCLOUD_PROJECT: projectId, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }).databaseId, '(default)');
  assert.throws(() => identityDatabaseTarget({ IDENTITY_EMULATORS: 'true', GCLOUD_PROJECT: config.projectId }));
  const deployment = JSON.parse(await readFile('firebase.json', 'utf8'));
  assert.equal(deployment.firestore[0].database, production.databaseId);
  const emulatorConfig = JSON.parse(await readFile('firebase.emulators.json', 'utf8'));
  assert.equal(emulatorConfig.firestore.database, undefined);
});


test('a paused deletion attempt cannot mutate recreated profile data after lease takeover completes', async () => {
  const uid = 'lease-takeover';
  await createFixtureUser(uid);
  const token = await signInFixture(uid);
  await callIdentity(token, 'register', { sessionId: 'event-two' });
  const first = await beginProfileDeletion(fixtureDb, uid);
  const paused = createProfileCleanup(fixtureDb, uid, first.attemptId);
  // A remains alive with an old generation; B takes over an expired lease.
  await fixtureDb.doc(`profileDeletionJobs/${uid}`).update({ leaseUntil: 0 });
  assert.equal((await callIdentity(token, 'delete-profile')).status, 200);
  await assertSucceeds(setDoc(doc(memberContext(uid), `profiles/${uid}`), { name: 'Fresh profile', state: 'active' }));
  const fresh = await callIdentity(token, 'register', { sessionId: 'event-two', adjective: 'Keep fresh defaults' });
  assert.equal(fresh.status, 200);
  await fixtureDb.doc('proposedChallengeVotes/fresh-after-takeover').set({ uid, sessionId: 'event-two' });
  // A resumes UID-wide queries after recreation. Even newly discovered targets
  // are protected because the attempt token is checked inside EVERY write batch.
  paused.delete(fixtureDb.doc(`registrations/event-two~${uid}`));
  paused.delete(fixtureDb.doc(`registrationDefaults/${uid}`));
  paused.delete(fixtureDb.doc('proposedChallengeVotes/fresh-after-takeover'));
  paused.update(fixtureDb.doc(`participants/${fresh.data.participantId}`), { name: 'Must never write this' });
  await assert.rejects(paused.finish(), /superseded/);
  assert.equal((await fixtureDb.doc(`registrations/event-two~${uid}`).get()).exists, true);
  assert.equal((await fixtureDb.doc(`registrationDefaults/${uid}`).get()).data()!.adjective, 'Keep fresh defaults');
  assert.equal((await fixtureDb.doc('proposedChallengeVotes/fresh-after-takeover').get()).exists, true);
  assert.equal((await fixtureDb.doc(`participants/${fresh.data.participantId}`).get()).data()!.name, 'Fresh profile');
  assert.deepEqual((await fixtureDb.doc(`profiles/${uid}`).get()).data(), { name: 'Fresh profile', state: 'active' });
});
