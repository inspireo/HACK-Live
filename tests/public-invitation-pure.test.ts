import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePublication, buildCalendar, publicProjection, INVITATION_TTL_MS, isCurrentInvitation } from '../server/event-invitations';

const scheduled = {
  title: 'Hack @ Singapore', description: 'Build together', venue: 'Community Hall', viewingUrl: 'https://example.test/watch',
  startLocal: '2026-12-03T09:30', endLocal: '2026-12-03T17:00', timeZone: 'Asia/Singapore', calendarEnabled: true,
};

test('publication defaults preserve registration, calendar opt-in and explicit dates only', () => {
  const publication = validatePublication({ title: 'Workshop' });
  assert.equal(publication.registrationRequired, true);
  assert.equal(publication.calendarEnabled, false);
  assert.equal(publication.startsAt, undefined);
  assert.throws(() => validatePublication({ title: 'Workshop', calendarEnabled: true }));
  assert.throws(() => validatePublication({ title: 'Workshop', registrationRequired: false }));
  assert.throws(() => validatePublication({ title: 'Workshop', registrationRequired: false, venue: 'Hall' }));
});

test('published fields reject unknown data, unsafe URLs and impossible explicit-zone ranges', () => {
  for (const mutation of [
    { sessionId: 'PRIVATE' }, { createdAt: Date.now() }, { ownerEmail: 'PRIVATE' },
    { viewingUrl: 'javascript:alert(1)' }, { viewingUrl: 'https://user:secret@example.test' },
    { viewingUrl: 'https://example.test/\r\nBEGIN:VEVENT' }, { title: '<b>Workshop</b>' },
    { registrationRequired: 'false' }, { calendarEnabled: 1 }, { timeZone: '+08:00' }, { timeZone: 'Not/AZone' },
    { startLocal: '2026-02-30T09:30' }, { endLocal: '2026-12-03T09:00' },
    { startLocal: '2026-03-08T02:30', endLocal: '2026-03-08T04:00', timeZone: 'America/New_York' },
    { startLocal: '2026-11-01T01:30', endLocal: '2026-11-01T04:00', timeZone: 'America/New_York' },
  ]) assert.throws(() => validatePublication({ ...scheduled, ...mutation }), JSON.stringify(mutation));
  const publication = validatePublication(scheduled);
  assert.equal(publication.startsAt, '2026-12-03T01:30:00Z');
  assert.equal(publication.endsAt, '2026-12-03T09:00:00Z');
  assert.equal(publication.timeZone, 'Asia/Singapore');
});

test('public projection explicitly reconstructs the allowlist', () => {
  const publication = { ...validatePublication(scheduled), currentToken: 'SECRET', sessionId: 'PRIVATE', ownerEmail: 'PRIVATE', createdAt: 1, code: 'PRIVATE', challenges: ['PRIVATE'] };
  const projection = publicProjection(publication, 42);
  assert.deepEqual(Object.keys(projection).sort(), ['calendarEnabled', 'description', 'endsAt', 'expiresAt', 'registrationRequired', 'startsAt', 'timeZone', 'title', 'venue', 'viewingUrl'].sort());
  assert.doesNotMatch(JSON.stringify(projection), /PRIVATE|SECRET|createdAt|sessionId/);
});

test('strict fixed seven-day expiry and current token fail closed', () => {
  const createdAt = 1000;
  const invitation = { createdAt, expiresAt: createdAt + INVITATION_TTL_MS, sessionId: 'event', revoked: false };
  const publication = { published: true, currentToken: 'token' };
  assert.equal(INVITATION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.ok(isCurrentInvitation('token', invitation, publication, invitation.expiresAt - 1));
  for (const [token, record, published, now] of [
    ['token', invitation, publication, invitation.expiresAt],
    ['old', invitation, publication, 2000],
    ['token', { ...invitation, revoked: true }, publication, 2000],
    ['token', invitation, { ...publication, published: false }, 2000],
    ['token', { ...invitation, expiresAt: invitation.expiresAt + 1 }, publication, 2000],
  ] as const) assert.equal(isCurrentInvitation(token, record, published, now), false);
});

test('RFC5545 calendar uses UTC instants, opaque UID, escaped TEXT and UTF8 octet folding', () => {
  const publication = validatePublication({ ...scheduled, description: '😀'.repeat(65) + '\nATTENDEE:evil@example.test;comma,back\\slash', venue: 'Hall; East, Wing\\A' });
  const calendar = buildCalendar(publication, '91874fca-bf35-4d0b-94fc-c209db15be88', 1700000000000);
  assert.ok(calendar.endsWith('\r\n'));
  assert.doesNotMatch(calendar.replace(/\r\n/g, ''), /[\r\n]/);
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.equal(Buffer.from(calendar, 'utf8').toString('utf8'), calendar);
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.match(unfolded, /DTSTART:20261203T013000Z\r\nDTEND:20261203T090000Z/);
  assert.match(unfolded, /UID:91874fca-bf35-4d0b-94fc-c209db15be88@hack-live/);
  assert.match(unfolded, /LOCATION:Hall\\; East\\, Wing\\\\A/);
  assert.match(unfolded, /\\nATTENDEE:evil@example.test\\;comma\\,back\\\\slash/);
  assert.doesNotMatch(unfolded, /\r\nATTENDEE:|TZID=|sessionId|ownerEmail/);
  assert.match(unfolded, /URL:https:\/\/example.test\/watch/);
});
