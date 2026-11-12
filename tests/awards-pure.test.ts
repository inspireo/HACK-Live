import assert from 'node:assert/strict';
import { test } from 'node:test';
import { awardId, awardName, awardSummary, awardTarget } from '../shared/awards';

test('recipient selectors and metadata reject malformed input', () => {
  for (const value of ['', '../other', 'a/b', null, {}, 'a'.repeat(129)]) assert.equal(awardId(value), false);
  assert.equal(awardName('  '), false);
  assert.equal(awardName('a'.repeat(101)), false);
  assert.equal(awardTarget('team', { collectionName: 'formingTeams', teamId: 'team' }), false);
  assert.equal(awardTarget('individual', { participantId: 'p', memberId: 'arbitrary' }), false);
  assert.equal(awardTarget('individual', { participantId: 'p' }), true);
  assert.equal(awardTarget('team', { collectionName: 'teams', teamId: 'team' }), true);
});
test('community summary has an exact allowlist with no contact, personal reference or audit data', () => {
  const summary = awardSummary('award', { sessionId: 'event', publishedAt: 'date', reason: 'private reason', actorUid: 'actor', email: 'private', snapshot: { eventName: 'Past event', eventDate: '2025-01-01', categoryName: 'Award', team: { name: 'Original team', teamId: 'team' }, recipients: [{ memberId: 'private-uid', name: 'Name' }] } }, ['Name']);
  assert.deepEqual(summary, { id: 'award', sessionId: 'event', eventName: 'Past event', eventDate: '2025-01-01', categoryName: 'Award', teamName: 'Original team', publishedAt: 'date', recipientNames: ['Name'] });
});
