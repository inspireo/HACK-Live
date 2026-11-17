import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { callIdentity, fixtureDb } from './fixtures';
import { deleteLifecycleEvent, seedLifecycle } from './event-lifecycle-fixtures';

let fixture: Awaited<ReturnType<typeof seedLifecycle>>;
beforeEach(async () => { fixture = await seedLifecycle(); });

test('deleted event rejects new check-ins but retains private history and authorized audited corrections', async () => {
  const { tokens, participantId } = fixture;
  assert.equal((await callIdentity(tokens.newcomer, 'register', { sessionId: 'event-one' })).status, 200);
  const attendance = { sessionId: 'event-one', memberUid: 'member', requestId: crypto.randomUUID() };
  const verified = await callIdentity(tokens.organizer, 'attendance', attendance);
  assert.equal(verified.status, 200, JSON.stringify(verified));
  assert.equal((await callIdentity(tokens.member, 'history-visibility', { sessionId: 'event-one', visible: true })).status, 200);
  const original = (await fixtureDb.doc('attendance/event-one~member').get()).data()!;
  const registration = (await fixtureDb.doc('registrations/event-one~member').get()).data();
  await deleteLifecycleEvent(tokens.organizer);
  assert.deepEqual((await fixtureDb.doc('attendance/event-one~member').get()).data(), original);
  for (const memberUid of ['member', 'newcomer']) {
    assert.equal((await callIdentity(tokens.coadmin, 'attendance', { ...attendance, memberUid, requestId: crypto.randomUUID() })).status, 404);
  }
  assert.equal((await fixtureDb.doc('attendance/event-one~newcomer').get()).exists, false);
  assert.equal((await fixtureDb.collection('attendanceAudit').get()).size, 1);
  const own = await callIdentity(tokens.member, 'member-history');
  const shared = await callIdentity(tokens.outsider, 'member-history', { memberUid: 'member' });
  assert.equal(own.status, 200); assert.equal(shared.status, 200);
  assert.equal(own.data.entries[0].attendanceStatus, 'verified-attended');
  assert.equal(shared.data.entries[0].attendanceStatus, 'verified-attended');
  assert.equal('audit' in shared.data.entries[0], false);
  const correction = { ...attendance, requestId: crypto.randomUUID(), action: 'correct', expectedRevision: 1, status: 'removed', occurredAt: original.occurredAt, method: 'manual_evidence', evidence: 'Private retained register', reason: 'Private historical correction' };
  assert.equal((await callIdentity(tokens.outsider, 'attendance', correction)).status, 403);
  assert.equal((await callIdentity(tokens.coadmin, 'attendance', correction)).status, 200);
  assert.equal((await callIdentity(tokens.organizer, 'attendance', { ...correction, requestId: crypto.randomUUID() })).status, 409);
  assert.equal((await callIdentity(tokens.organizer, 'attendance', { ...correction, memberUid: 'newcomer', requestId: crypto.randomUUID() })).status, 409);
  const corrected = (await fixtureDb.doc('attendance/event-one~member').get()).data()!;
  assert.equal(corrected.revision, 2); assert.equal(corrected.status, 'removed');
  assert.deepEqual(corrected.event, original.event);
  assert.deepEqual((await fixtureDb.doc('registrations/event-one~member').get()).data(), registration);
  assert.ok((await fixtureDb.doc(`participants/${participantId}`).get()).exists);
  const staff = await callIdentity(tokens.organizer, 'event-attendance', { sessionId: 'event-one' });
  assert.equal(staff.status, 200); assert.equal(staff.data.records[0].audit.length, 2);
  assert.equal((await callIdentity(tokens.outsider, 'event-attendance', { sessionId: 'event-one' })).status, 403);
  const correctedShared = (await callIdentity(tokens.outsider, 'member-history', { memberUid: 'member' })).data.entries[0];
  assert.equal(correctedShared.attendanceStatus, 'not-verified');
  assert.doesNotMatch(JSON.stringify(correctedShared), /Private|evidence|reason|audit/);
  assert.equal((await callIdentity(tokens.member, 'history-visibility', { sessionId: 'event-one', visible: false })).status, 200);
  assert.deepEqual((await callIdentity(tokens.outsider, 'member-history', { memberUid: 'member' })).data.entries, []);
});
