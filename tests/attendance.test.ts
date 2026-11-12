import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pairKey } from '../server/connections';
import { emptyDetails } from '../shared/profile';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assertSucceeds, assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { beginProfileDeletion, createProfileCleanup, releaseProfileDeletion, withProfileDeletionFence } from '../server/profile-cleanup';
import { planAttendanceCleanup, applyAttendanceCleanupTarget, cleanupAttendance } from '../server/attendance-cleanup';
import { callIdentity, clearFixtures, createFixtureUser, fixtureAuth, fixtureDb, projectId, seedEvents, signInFixture } from './fixtures';

let environment: RulesTestEnvironment;
const tokens: Record<string, string> = {};
const attend = (actor: string, payload: object = {}) => callIdentity(tokens[actor], 'attendance', { sessionId: 'event-one', memberUid: 'attendee', requestId: crypto.randomUUID(), ...payload });
before(async () => {
  await clearFixtures(); await seedEvents();
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  for (const uid of ['organizer', 'coadmin', 'platform', 'attendee', 'unrelated', 'mentor', 'volunteer', 'inactive', 'unlinked', 'deleting', 'verifier', 'erasable-staff', 'race-member', 'disabled-member']) { await createFixtureUser(uid); tokens[uid] = await signInFixture(uid); }
  await createFixtureUser('unverified', false); tokens.unverified = await signInFixture('unverified');
  await fixtureDb.doc('users/platform').set({ role: 'admin' });
  for (const uid of ['attendee', 'mentor', 'volunteer', 'inactive', 'deleting', 'verifier', 'erasable-staff', 'race-member', 'disabled-member']) assert.equal((await callIdentity(tokens[uid], 'register', { sessionId: 'event-one' })).status, 200);
  assert.equal((await callIdentity(tokens.attendee, 'register', { sessionId: 'event-two' })).status, 200);
  await callIdentity(tokens.organizer, 'event-roles', { sessionId: 'event-one', memberUid: 'mentor', roles: ['mentor', 'organizer/facilitator'] });
  await callIdentity(tokens.organizer, 'event-roles', { sessionId: 'event-one', memberUid: 'volunteer', roles: ['volunteer'] });
  await callIdentity(tokens.organizer, 'event-roles', { sessionId: 'event-one', memberUid: 'inactive', roles: ['participant'], participationState: 'inactive' });
});
after(async () => { await environment?.cleanup(); });

test('rules hide attendance, raw audits, visibility and deletion manifests from every client actor', async () => {
  for (const actor of ['attendee', 'organizer', 'coadmin', 'platform', 'unrelated', 'anonymous', undefined]) {
    const database = actor ? environment.authenticatedContext(actor, { email: `${actor}@example.test`, email_verified: true, firebase: { sign_in_provider: actor === 'anonymous' ? 'anonymous' : 'password' } }).firestore() : environment.unauthenticatedContext().firestore();
    for (const path of ['attendance/event-one~attendee', 'attendanceAudit/private', 'historyVisibility/event-one~attendee', 'profileDeletionJobs/attendee']) {
      await assertFails(getDoc(doc(database, path))); await assertFails(setDoc(doc(database, path), { uid: actor || 'fake', status: 'attended' }));
    }
  }
});

test('API rejects signed-out, anonymous, unverified, ordinary and role-label staff impersonation', async () => {
  assert.equal((await attend('missing')).status, 401);
  assert.equal((await attend('unverified')).status, 403);
  const anonymousResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  tokens.anonymous = (await anonymousResponse.json()).idToken;
  for (const actor of ['anonymous', 'attendee', 'unrelated', 'mentor']) assert.equal((await attend(actor)).status, 403);
  for (const actor of ['missing', 'anonymous', 'unverified']) assert.ok([401, 403].includes((await callIdentity(tokens[actor], 'member-history', { memberUid: 'attendee' })).status));
  assert.equal((await attend('organizer', { memberUid: 'organizer' })).status, 403);
  await fixtureDb.doc('sessions/event-two').update({ ownerId: 'unrelated' });
  await fixtureDb.doc('sessionAccess/event-two').update({ adminEmails: [] });
  assert.equal((await attend('coadmin', { sessionId: 'event-two' })).status, 403);
});

test('registration history is private, remains distinct, and canonical pointer rejects cross-event/legacy identities', async () => {
  const own = await callIdentity(tokens.attendee, 'member-history');
  assert.equal(own.status, 200); assert.equal(own.data.entries.length, 2);
  assert.ok(own.data.entries.every((entry: any) => entry.attendanceStatus === 'not-verified' && entry.eventDate === null && !entry.visible));
  assert.deepEqual((await callIdentity(tokens.unrelated, 'member-history', { memberUid: 'attendee' })).data.entries, []);
  assert.deepEqual((await callIdentity(tokens.platform, 'member-history', { memberUid: 'attendee' })).data.entries, []);
  for (const memberUid of ['inactive', 'unlinked']) assert.equal((await attend('organizer', { memberUid })).status, 409);
  await fixtureDb.doc('participants/legacy-attendee').set({ uid: 'unlinked', sessionId: 'event-one', name: 'Untrusted legacy' });
  assert.equal((await attend('organizer', { memberUid: 'unlinked' })).status, 409);
  const secondPointer = (await fixtureDb.doc('registrations/event-two~attendee').get()).data()!;
  const ownPointer = (await fixtureDb.doc('registrations/event-one~attendee').get()).data()!;
  await fixtureDb.doc('registrations/event-two~attendee').update({ participantId: ownPointer.participantId });
  assert.equal((await attend('platform', { sessionId: 'event-two' })).status, 409);
  await fixtureDb.doc('registrations/event-two~attendee').set(secondPointer);
});

test('disabled and inactive/deleted/unlinked targets cannot receive attendance', async () => {
  await fixtureAuth.updateUser('disabled-member', { disabled: true });
  assert.equal((await attend('organizer', { memberUid: 'disabled-member' })).status, 409);
  const pointer = (await fixtureDb.doc('registrations/event-one~inactive').get()).data()!;
  await fixtureDb.doc(`participants/${pointer.participantId}`).update({ participationState: 'active', identityState: 'deleted' });
  assert.equal((await attend('organizer', { memberUid: 'inactive' })).status, 409);
});

test('concurrent check-ins are idempotent, verified mentors can attend without teams', async () => {
  const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) => attend(index % 2 ? 'organizer' : 'coadmin')));
  assert.ok(attempts.every(attempt => attempt.status === 200), JSON.stringify(attempts));
  assert.equal(attempts.filter(attempt => !attempt.data.duplicate).length, 1);
  const audits = await fixtureDb.collection('attendanceAudit').where('memberUid', '==', 'attendee').get();
  assert.equal(audits.size, 1);
  assert.equal((await fixtureDb.doc('attendance/event-one~attendee').get()).data()?.revision, 1);
  assert.equal((await attend('platform', { memberUid: 'mentor' })).status, 200);
  const mentor = (await fixtureDb.doc('attendance/event-one~mentor').get()).data()!;
  assert.equal(mentor.status, 'attended'); assert.ok(mentor.occurredAt && mentor.recordedAt && mentor.verifiedBy === 'platform');
  const participant = await fixtureDb.doc(`participants/${mentor.participantId}`).get();
  assert.equal(participant.data()?.teamId, null);
  assert.equal((await attend('organizer', { memberUid: 'volunteer', recordedAt: '1900-01-01T00:00:00Z', verifiedBy: 'spoof' })).status, 200);
  const volunteer = (await fixtureDb.doc('attendance/event-one~volunteer').get()).data()!;
  assert.equal(volunteer.verifiedBy, 'organizer');
  assert.notEqual(volunteer.recordedAt, '1900-01-01T00:00:00Z');
});

test('corrections require evidence/date/reason, enforce revision, preserve audit and exact replay', async () => {
  const correction = { action: 'correct', status: 'removed', expectedRevision: 1, reason: 'Synthetic roster correction', evidence: 'Synthetic signed desk roster', occurredAt: '2025-03-04T10:00:00.000Z', method: 'manual_evidence', requestId: 'correction-one' };
  for (const invalid of [{ reason: '' }, { evidence: '' }, { occurredAt: null }, { expectedRevision: 99 }]) assert.ok([400, 409].includes((await attend('organizer', { ...correction, ...invalid })).status));
  const corrected = await attend('organizer', correction); assert.equal(corrected.status, 200); assert.equal(corrected.data.revision, 2);
  assert.equal((await attend('organizer', correction)).data.duplicate, true);
  assert.equal((await attend('organizer', { ...correction, reason: 'Different' })).status, 409);
  assert.equal((await attend('organizer')).status, 409);
  const restore = { ...correction, status: 'attended', expectedRevision: 2, requestId: 'restore' };
  const race = await Promise.all([attend('organizer', restore), attend('coadmin', { ...restore, requestId: 'other-restore' })]);
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  assert.equal((await fixtureDb.collection('attendanceAudit').where('memberUid', '==', 'attendee').get()).size, 3);
  assert.equal((await callIdentity(tokens.unrelated, 'event-attendance', { sessionId: 'event-one' })).status, 403);
  assert.equal((await callIdentity(tokens.coadmin, 'event-attendance', { sessionId: 'event-one' })).status, 200);
});

test('past event cannot use a new timestamp without date/evidence; snapshots survive rename/deletion', async () => {
  await fixtureDb.doc('sessions/event-two').set({ ownerId: 'organizer', title: 'Original historical event', date: '2025-03-04', createdAt: Date.now(), status: 'Closed' });
  await callIdentity(tokens.attendee, 'register', { sessionId: 'event-two' });
  assert.equal((await attend('organizer', { sessionId: 'event-two' })).status, 400);
  assert.equal((await attend('organizer', { sessionId: 'event-two', occurredAt: '2025-03-04T10:00:00Z' })).status, 400);
  assert.equal((await attend('organizer', { sessionId: 'event-two', occurredAt: '2025-03-04T10:00:00Z', evidence: 'Synthetic archived roster', method: 'manual_evidence' })).status, 200);
  await fixtureDb.doc('sessions/event-two').update({ title: 'Renamed' });
  await fixtureDb.doc('sessions/event-two').delete();
  const entry = (await callIdentity(tokens.attendee, 'member-history')).data.entries.find((item: any) => item.sessionId === 'event-two');
  assert.equal(entry.eventName, 'Original historical event'); assert.equal(entry.eventDate, '2025-03-04');
});

test('visibility is member-controlled and safe summaries exclude audits and staff information', async () => {
  assert.equal((await callIdentity(tokens.unrelated, 'history-visibility', { sessionId: 'event-one', memberUid: 'attendee', visible: true })).status, 409);
  assert.equal((await callIdentity(tokens.attendee, 'history-visibility', { sessionId: 'event-one', visible: true })).status, 200);
  const shared = await callIdentity(tokens.unrelated, 'member-history', { memberUid: 'attendee' });
  assert.equal(shared.data.entries.length, 1);
  assert.deepEqual(Object.keys(shared.data.entries[0]).sort(), ['sessionId', 'eventName', 'eventDate', 'registered', 'attendanceStatus', 'occurredAt'].sort());
  assert.equal(shared.data.entries[0].attendanceStatus, 'verified-attended');
  assert.equal(shared.data.entries[0].eventDate, null);
  assert.equal((await callIdentity(tokens.attendee, 'member-history')).data.entries[0].audit.length, 3);
  await callIdentity(tokens.attendee, 'history-visibility', { sessionId: 'event-one', visible: false });
  assert.deepEqual((await callIdentity(tokens.unrelated, 'member-history', { memberUid: 'attendee' })).data.entries, []);
});

test('deletion races fence check-in/visibility and retry removes subject and verifier references', async () => {
  await fixtureDb.doc('sessionAccess/event-one').update({ adminEmails: ['coadmin@example.test', 'verifier@example.test'] });
  assert.equal((await attend('verifier', { memberUid: 'deleting' })).status, 200);
  assert.equal((await callIdentity(tokens.deleting, 'history-visibility', { sessionId: 'event-one', visible: true })).status, 200);
  const race = await Promise.all([callIdentity(tokens.deleting, 'delete-profile'), attend('organizer', { memberUid: 'deleting' }), callIdentity(tokens.deleting, 'history-visibility', { sessionId: 'event-one', visible: true })]);
  assert.equal(race[0].status, 200);
  assert.ok([200, 409].includes(race[1].status)); assert.ok([200, 409].includes(race[2].status));
  for (const [collectionName, field] of [['attendance', 'uid'], ['attendanceAudit', 'memberUid'], ['historyVisibility', 'uid']]) assert.equal((await fixtureDb.collection(collectionName).where(field, '==', 'deleting').get()).size, 0);
  assert.equal((await callIdentity(tokens.unrelated, 'member-history', { memberUid: 'deleting' })).status, 404);
  assert.equal((await attend('organizer', { memberUid: 'deleting' })).status, 409);
  // The shared persisted plan survives partial scrub and lease takeover.
  await fixtureDb.doc('attendance/orphan').set({ sessionId: 'event-one', verifiedBy: 'verifier', uid: 'mentor' });
  await fixtureDb.doc('attendanceAudit/orphan').set({ memberUid: 'mentor', staffUid: 'verifier', evidence: 'Private verifier text', reason: 'Private verifier text' });
  const first = await beginProfileDeletion(fixtureDb, 'verifier');
  const saved = await planAttendanceCleanup(fixtureDb, 'verifier', first.attemptId);
  const reference = saved.targets.find(target => target.path === 'attendance/orphan')!;
  assert.ok(reference);
  await applyAttendanceCleanupTarget(fixtureDb, 'verifier', first.attemptId, reference);
  assert.equal((await fixtureDb.doc('attendance/orphan').get()).data()?.verifiedBy, null);
  // Independent module namespace must coexist through retries.
  await withProfileDeletionFence(fixtureDb, 'verifier', first.attemptId, async (transaction, job) => {
    transaction.update(job.ref, { awardPlan: { targets: ['preserved-award-key'], completed: true } });
  });
  await releaseProfileDeletion(fixtureDb, 'verifier', first.attemptId);
  const second = await beginProfileDeletion(fixtureDb, 'verifier');
  assert.deepEqual((await fixtureDb.doc('profileDeletionJobs/verifier').get()).data()?.awardPlan, { targets: ['preserved-award-key'], completed: true });
  assert.deepEqual(await planAttendanceCleanup(fixtureDb, 'verifier', second.attemptId), saved);
  await assert.rejects(cleanupAttendance(fixtureDb, 'verifier', first.attemptId), /superseded/);
  await cleanupAttendance(fixtureDb, 'verifier', second.attemptId);
  await cleanupAttendance(fixtureDb, 'verifier', second.attemptId);
  assert.equal((await fixtureDb.doc('attendanceAudit/orphan').get()).data()?.staffUid, null);
  assert.equal((await fixtureDb.doc('attendanceAudit/orphan').get()).data()?.evidence, '');
  assert.deepEqual((await fixtureDb.doc('profileDeletionJobs/verifier').get()).data()?.attendancePlan.targets, saved.targets);
  assert.equal((await fixtureDb.doc('profiles/verifier').get()).data()?.state, 'deleting');
  await createProfileCleanup(fixtureDb, 'verifier', second.attemptId).finish();
  assert.equal((await fixtureDb.doc('profileDeletionJobs/verifier').get()).exists, false);
  assert.equal((await fixtureAuth.getUser('deleting')).emailVerified, true);
  assert.equal((await fixtureDb.doc('sessions/event-one').get()).data()?.ownerId, 'organizer');
});

test('verifier deletion racing a correction preserves the new verifier and clears old audit attribution', async () => {
  await fixtureDb.doc('sessionAccess/event-one').update({ adminEmails: ['erasable-staff@example.test'] });
  assert.equal((await attend('erasable-staff', { memberUid: 'race-member' })).status, 200);
  const results = await Promise.all([
    attend('organizer', { memberUid: 'race-member', action: 'correct', status: 'attended', expectedRevision: 1, reason: 'Synthetic verification update', evidence: 'Synthetic roster', occurredAt: '2025-03-04T10:00:00Z', method: 'manual_evidence' }),
    callIdentity(tokens['erasable-staff'], 'delete-profile'),
  ]);
  assert.ok(results.every(result => result.status === 200), JSON.stringify(results));
  assert.equal((await fixtureDb.doc('attendance/event-one~race-member').get()).data()?.verifiedBy, 'organizer');
  assert.equal((await fixtureDb.collection('attendanceAudit').where('staffUid', '==', 'erasable-staff').get()).size, 0);
  assert.equal((await fixtureDb.doc('sessions/event-one').get()).data()?.ownerId, 'organizer');
});

test('actual delete-profile takeover protects recreated attendance/history from every stale worker write', async () => {
  const uid = 'attendance-takeover';
  await createFixtureUser(uid); tokens[uid] = await signInFixture(uid);
  assert.equal((await callIdentity(tokens[uid], 'register', { sessionId: 'event-one' })).status, 200);
  assert.equal((await attend('organizer', { memberUid: uid })).status, 200);
  const first = await beginProfileDeletion(fixtureDb, uid);
  const saved = await planAttendanceCleanup(fixtureDb, uid, first.attemptId);
  const paused = createProfileCleanup(fixtureDb, uid, first.attemptId);
  const subject = saved.targets.find(target => target.path === `attendance/event-one~${uid}`)!;
  assert.ok(subject);
  await releaseProfileDeletion(fixtureDb, uid, first.attemptId);
  assert.equal((await callIdentity(tokens[uid], 'delete-profile')).status, 200);
  const client = environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertSucceeds(setDoc(doc(client, `profiles/${uid}`), { name: 'Recreated attendance member', state: 'active' }));
  const fresh = await callIdentity(tokens[uid], 'register', { sessionId: 'event-one' });
  assert.equal(fresh.status, 200);
  assert.equal((await attend('organizer', { memberUid: uid, requestId: 'new-generation' })).status, 200);
  assert.equal((await callIdentity(tokens[uid], 'history-visibility', { sessionId: 'event-one', visible: true })).status, 200);
  const attendanceRef = fixtureDb.doc(`attendance/event-one~${uid}`);
  const visibilityRef = fixtureDb.doc(`historyVisibility/event-one~${uid}`);
  const freshAttendance = (await attendanceRef.get()).data();
  const freshVisibility = (await visibilityRef.get()).data();
  paused.delete(attendanceRef); paused.delete(visibilityRef);
  // Stale planning, module mutation, lease renewal, bulk queue and completion.
  await assert.rejects(planAttendanceCleanup(fixtureDb, uid, first.attemptId), /superseded/);
  await assert.rejects(applyAttendanceCleanupTarget(fixtureDb, uid, first.attemptId, subject), /superseded/);
  await assert.rejects(cleanupAttendance(fixtureDb, uid, first.attemptId), /superseded/);
  await assert.rejects(withProfileDeletionFence(fixtureDb, uid, first.attemptId, async (transaction, job) => { transaction.update(job.ref, { attendancePlan: saved }); }), /superseded/);
  await assert.rejects(paused.finish(), /superseded/);
  assert.deepEqual((await attendanceRef.get()).data(), freshAttendance);
  assert.deepEqual((await visibilityRef.get()).data(), freshVisibility);
  assert.equal((await fixtureDb.doc(`profileDeletionJobs/${uid}`).get()).exists, false);
  const history = await callIdentity(tokens[uid], 'member-history');
  assert.equal(history.status, 200); assert.equal(history.data.entries[0].attendanceStatus, 'verified-attended');
  assert.equal(history.data.entries[0].visible, true);
  assert.equal(history.data.entries[0].audit.length, 1);
  // A newer pending deletion is also safe from old-generation planning writes.
  const next = await beginProfileDeletion(fixtureDb, uid);
  const currentJob = (await fixtureDb.doc(`profileDeletionJobs/${uid}`).get()).data();
  await assert.rejects(planAttendanceCleanup(fixtureDb, uid, first.attemptId), /superseded/);
  await assert.rejects(applyAttendanceCleanupTarget(fixtureDb, uid, first.attemptId, subject), /superseded/);
  assert.deepEqual((await fixtureDb.doc(`profileDeletionJobs/${uid}`).get()).data(), currentJob);
  await releaseProfileDeletion(fixtureDb, uid, next.attemptId);
  assert.equal((await callIdentity(tokens[uid], 'delete-profile')).status, 200);
});

test('profile state and module completion protect planning, mutation and parent finish', async () => {
  const uid = 'attendance-module-gate';
  await createFixtureUser(uid);
  const attempt = await beginProfileDeletion(fixtureDb, uid);
  await withProfileDeletionFence(fixtureDb, uid, attempt.attemptId, async (transaction, job) => {
    transaction.update(job.ref, { awardPlan: { targets: [], completed: false } });
  });
  await planAttendanceCleanup(fixtureDb, uid, attempt.attemptId);
  await assert.rejects(createProfileCleanup(fixtureDb, uid, attempt.attemptId).finish(), /module incomplete/);
  assert.equal((await fixtureDb.doc(`profiles/${uid}`).get()).data()?.state, 'deleting');
  await cleanupAttendance(fixtureDb, uid, attempt.attemptId);
  await assert.rejects(createProfileCleanup(fixtureDb, uid, attempt.attemptId).finish(), /awardPlan/);
  await withProfileDeletionFence(fixtureDb, uid, attempt.attemptId, async (transaction, job) => { transaction.update(job.ref, { 'awardPlan.completed': true }); });
  // Even a matching job attempt cannot mutate when the profile fence is gone.
  await fixtureDb.doc(`profiles/${uid}`).set({ state: 'active', name: 'Protected profile' });
  await assert.rejects(planAttendanceCleanup(fixtureDb, uid, attempt.attemptId), /superseded/);
  await assert.rejects(cleanupAttendance(fixtureDb, uid, attempt.attemptId), /superseded/);
  await assert.rejects(createProfileCleanup(fixtureDb, uid, attempt.attemptId).finish(), /superseded/);
  assert.deepEqual((await fixtureDb.doc(`profiles/${uid}`).get()).data(), { state: 'active', name: 'Protected profile' });
});

test('whole delete-profile partial failure retains shared plans and retries contacts/source/audit/verifier cleanup', async () => {
  const uid = 'whole-deletion'; const peerUid = 'whole-peer'; const subjectUid = 'whole-subject';
  for (const memberUid of [uid, peerUid, subjectUid]) { await createFixtureUser(memberUid); tokens[memberUid] = await signInFixture(memberUid); }
  for (const memberUid of [uid, peerUid]) assert.equal((await callIdentity(tokens[memberUid], 'save-profile', { name: `Synthetic ${memberUid}`, ...emptyDetails(), professional: { title: 'Synthetic private source' }, communityFields: ['title'], contacts: { phone: '555-0199' }, connectionFields: ['phone'] })).status, 200);
  const requested = await callIdentity(tokens[uid], 'connections/request', { peerUid });
  assert.equal(requested.status, 200);
  assert.equal((await callIdentity(tokens[peerUid], 'connections/accept', { peerUid: uid, generation: requested.data.generation })).status, 200);
  for (const memberUid of [uid, subjectUid]) assert.equal((await callIdentity(tokens[memberUid], 'register', { sessionId: 'event-one' })).status, 200);
  await fixtureDb.doc('sessionAccess/event-one').update({ adminEmails: [`${uid}@example.test`] });
  assert.equal((await attend('organizer', { memberUid: uid })).status, 200);
  assert.equal((await attend(uid, { memberUid: subjectUid, reason: 'Synthetic verifier private text', evidence: 'Synthetic verifier private evidence' })).status, 200);
  await callIdentity(tokens[uid], 'history-visibility', { sessionId: 'event-one', visible: true });
  // Deterministic real downstream failure: a malformed legacy publication path
  // is encountered AFTER attendance scrub, before parent queued writes finish.
  await fixtureDb.doc('proposedChallenges/whole-fault').set({ uid, sessionId: 'event-one', publishedChallengeId: 'invalid/path', submitterName: 'Synthetic whole-deletion' });
  const first = await callIdentity(tokens[uid], 'delete-profile');
  assert.equal(first.status, 500, JSON.stringify(first));
  const jobRef = fixtureDb.doc(`profileDeletionJobs/${uid}`);
  const interrupted = (await jobRef.get()).data()!;
  assert.equal((await fixtureDb.doc(`profiles/${uid}`).get()).data()?.state, 'deleting');
  assert.equal(interrupted.leaseUntil, 0);
  assert.equal(interrupted.attendancePlan.completed, true);
  assert.ok(interrupted.attendancePlan.targets.some((target: any) => target.path === `attendance/event-one~${uid}`));
  assert.ok(interrupted.attendancePlan.targets.some((target: any) => target.path === `attendance/event-one~${subjectUid}`));
  assert.equal((await fixtureDb.doc(`attendance/event-one~${uid}`).get()).exists, false);
  assert.equal((await fixtureDb.doc(`attendance/event-one~${subjectUid}`).get()).data()?.verifiedBy, null);
  const peerClient = environment.authenticatedContext(peerUid, { email: `${peerUid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(getDoc(doc(peerClient, `connectionContacts/${uid}`)));
  await assertFails(getDoc(doc(peerClient, `memberDetails/${uid}`)));
  assert.equal((await callIdentity(tokens[peerUid], 'member-history', { memberUid: uid })).status, 404);
  const stale = createProfileCleanup(fixtureDb, uid, interrupted.attemptId);
  // Repair only malformed legacy fixture; successful retry is the actual route.
  await fixtureDb.doc('proposedChallenges/whole-fault').update({ publishedChallengeId: '' });
  assert.equal((await callIdentity(tokens[uid], 'delete-profile')).status, 200);
  assert.equal((await jobRef.get()).exists, false);
  for (const collectionName of ['profileDetails', 'memberDetails', 'connectionContacts']) assert.equal((await fixtureDb.doc(`${collectionName}/${uid}`).get()).exists, false);
  assert.equal((await fixtureDb.doc(`connectionPairs/${pairKey(uid, peerUid)}`).get()).exists, false);
  assert.equal((await fixtureDb.doc(`connectionViews/${peerUid}/peers/${uid}`).get()).exists, false);
  assert.equal((await fixtureDb.collection('attendanceAudit').where('memberUid', '==', uid).get()).size, 0);
  assert.equal((await fixtureDb.collection('attendanceAudit').where('staffUid', '==', uid).get()).size, 0);
  const subjectHistory = await callIdentity(tokens[subjectUid], 'member-history');
  assert.equal(subjectHistory.status, 200);
  assert.equal(subjectHistory.data.entries[0].attendanceStatus, 'verified-attended');
  assert.equal(subjectHistory.data.entries[0].audit[0].staffUid, null);
  assert.equal(subjectHistory.data.entries[0].audit[0].evidence, '');
  const ownClient = environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertSucceeds(setDoc(doc(ownClient, `profiles/${uid}`), { name: 'New whole profile', state: 'active' }));
  assert.equal((await callIdentity(tokens[uid], 'register', { sessionId: 'event-one' })).status, 200);
  assert.equal((await attend('organizer', { memberUid: uid })).status, 200);
  assert.equal((await callIdentity(tokens[uid], 'save-profile', { name: 'New whole profile', ...emptyDetails(), professional: { title: 'Fresh preserved source' }, communityFields: ['title'], contacts: { phone: '555-0111' }, connectionFields: ['phone'] })).status, 200);
  stale.delete(fixtureDb.doc(`profileDetails/${uid}`)); stale.delete(fixtureDb.doc(`attendance/event-one~${uid}`));
  await assert.rejects(stale.finish(), /superseded/);
  await assert.rejects(cleanupAttendance(fixtureDb, uid, interrupted.attemptId), /superseded/);
  assert.equal((await fixtureDb.doc(`profileDetails/${uid}`).get()).data()?.professional.title, 'Fresh preserved source');
  assert.deepEqual((await fixtureDb.doc(`memberDetails/${uid}`).get()).data(), { title: 'Fresh preserved source' });
  assert.deepEqual((await fixtureDb.doc(`connectionContacts/${uid}`).get()).data(), { phone: '555-0111' });
  assert.equal((await fixtureDb.collection('attendanceAudit').where('memberUid', '==', uid).get()).size, 1);
  assert.equal((await callIdentity(tokens[uid], 'member-history')).data.entries[0].attendanceStatus, 'verified-attended');
});

test('optional metadata backfill uses parent database target, is dry-run/repeatable and never promotes attendance', async () => {
  const uid = 'metadata-backfill';
  await createFixtureUser(uid); const token = await signInFixture(uid);
  const registered = await callIdentity(token, 'register', { sessionId: 'event-one' });
  assert.equal(registered.status, 200);
  const pointerRef = fixtureDb.doc(`registrations/event-one~${uid}`);
  await pointerRef.set({ uid, sessionId: 'event-one', participantId: registered.data.participantId });
  const beforeCount = (await fixtureDb.collection('attendance').get()).size;
  const migrate = (apply: boolean) => JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/snapshot-history.ts', ...(apply ? ['--apply'] : [])], { env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8' }));
  const dryRun = migrate(false); assert.equal(dryRun.mode, 'dry-run'); assert.ok(dryRun.metadataSnapshots >= 1);
  assert.equal((await pointerRef.get()).data()?.event, undefined);
  assert.ok(migrate(true).metadataSnapshots >= 1);
  assert.deepEqual((await pointerRef.get()).data()?.event, { title: 'Synthetic Design Workshop', date: null });
  assert.equal(migrate(true).metadataSnapshots, 0);
  assert.equal((await fixtureDb.collection('attendance').get()).size, beforeCount);
  const history = await callIdentity(token, 'member-history');
  assert.equal(history.data.entries[0].attendanceStatus, 'not-verified');
  assert.equal(history.data.entries[0].eventDate, null);
});
