import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { cleanupAttendance } from '../server/attendance-cleanup';
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
    for (const path of ['attendance/event-one~attendee', 'attendanceAudit/private', 'historyVisibility/event-one~attendee', 'attendanceCleanup/attendee/items/private']) {
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
  // A persisted manifest survives a prior partial pass after search keys vanished.
  await fixtureDb.doc('profiles/verifier').update({ state: 'deleting' });
  await fixtureDb.doc('attendance/orphan').set({ sessionId: 'event-one', verifiedBy: 'verifier', uid: 'mentor' });
  await fixtureDb.doc('attendanceCleanup/verifier/items/recovery').set({ path: 'attendance/orphan', kind: 'verifier' });
  await fixtureDb.doc('attendanceAudit/orphan').set({ memberUid: 'mentor', staffUid: 'verifier', evidence: 'Private verifier text', reason: 'Private verifier text' });
  await fixtureDb.doc('attendance/orphan').update({ verifiedBy: null });
  await cleanupAttendance(fixtureDb, 'verifier'); await cleanupAttendance(fixtureDb, 'verifier');
  assert.equal((await fixtureDb.doc('attendance/orphan').get()).data()?.verifiedBy, null);
  assert.equal((await fixtureDb.doc('attendanceAudit/orphan').get()).data()?.staffUid, null);
  assert.equal((await fixtureDb.doc('attendanceAudit/orphan').get()).data()?.evidence, '');
  assert.equal((await fixtureDb.collection('attendanceCleanup/verifier/items').get()).size, 0);
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
