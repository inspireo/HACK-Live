import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactProjection, nextConnectionState, type ConnectionView } from '../shared/connections';
import { emptyDetails } from '../shared/profile';
import { pairKey, blockKey } from '../server/connections';

test('pair identity is order-independent and unambiguous; block digests omit identity', () => {
  assert.equal(pairKey('first', 'second'), pairKey('second', 'first'));
  assert.notEqual(pairKey('ab', 'c'), pairKey('a', 'bc'));
  assert.notEqual(pairKey('a~b', 'c'), pairKey('a', 'b~c'));
  assert.match(blockKey('member'), /^[a-f0-9]{64}$/);
});
test('contact projection contains only populated globally selected allowlisted fields', () => {
  const details = emptyDetails();
  details.contacts = { phone: '555', contactEmail: 'private@example.test', signal: '' };
  details.connectionFields = ['phone', 'signal'];
  assert.deepEqual(contactProjection(details), { phone: '555' });
  details.connectionFields = [];
  assert.deepEqual(contactProjection(details), {});
});
test('state machine requires recipient consent and never autoaccepts opposite requests', () => {
  const pending: ConnectionView = { pairId: 'pair', peerUid: 'recipient', requester: 'sender', generation: 'first', state: 'pending', unread: false };
  assert.equal(nextConnectionState('request', 'recipient', pending), 'pending');
  assert.throws(() => nextConnectionState('accept', 'sender', pending));
  assert.throws(() => nextConnectionState('decline', 'sender', pending));
  assert.throws(() => nextConnectionState('cancel', 'recipient', pending));
  assert.equal(nextConnectionState('accept', 'recipient', pending), 'accepted');
  assert.equal(nextConnectionState('cancel', 'sender', pending), 'cancelled');
  for (const state of ['cancelled', 'declined', 'removed', 'blocked'] as const) assert.throws(() => nextConnectionState('accept', 'recipient', { ...pending, state }));
  assert.equal(nextConnectionState('unfriend', 'recipient', { ...pending, state: 'accepted' }), 'removed');
  assert.equal(nextConnectionState('block', 'sender', pending), 'blocked');
});
