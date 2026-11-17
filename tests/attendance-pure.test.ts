import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceEligible, eventSnapshot, historySummary } from '../shared/attendance';

test('active linked mentor and volunteer attendance does not require allocation eligibility', () => {
  for (const officialRoles of [['mentor'], ['volunteer'], ['participant'], undefined]) {
    assert.equal(attendanceEligible({ sessionId: 'event', uid: 'member', memberId: 'member', officialRoles }, 'event', 'member'), true);
  }
  for (const changes of [{ participationState: 'inactive' }, { identityState: 'deleted' }, { memberId: null }, { uid: 'other' }, { sessionId: 'other' }]) {
    assert.equal(attendanceEligible({ sessionId: 'event', uid: 'member', memberId: 'member', ...changes }, 'event', 'member'), false);
  }
});
test('legacy registration never promotes to attendance and createdAt is never an event date', () => {
  const snapshot = eventSnapshot({ title: 'Original event', createdAt: Date.now(), adminEmails: ['private@example.test'] });
  assert.deepEqual(snapshot, { title: 'Original event', date: null });
  assert.deepEqual(historySummary('event', snapshot, undefined, true), { sessionId: 'event', eventName: 'Original event', eventDate: null, registered: true, attendanceStatus: 'not-verified', occurredAt: null });
  const projected = historySummary('event', snapshot, { status: 'attended', occurredAt: '2025-01-01T12:00:00.000Z', reason: 'private', verifiedBy: 'private', evidence: 'private' }, true);
  assert.equal(projected.attendanceStatus, 'verified-attended');
  assert.equal(projected.eventDate, null);
  assert.equal(projected.occurredAt, '2025-01-01T12:00:00.000Z');
  assert.equal(JSON.stringify(projected).includes('private'), false);
  assert.equal(historySummary('event', snapshot, { status: 'removed', occurredAt: 'old' }, true).occurredAt, null);
  assert.equal(eventSnapshot({ date: 'unknown' }).date, null);
});
